import {
  WebSocketGateway,
  SubscribeMessage,
  MessageBody,
  WebSocketServer,
  ConnectedSocket,
  OnGatewayConnection,
  OnGatewayDisconnect,
  OnGatewayInit,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { Logger, Inject, forwardRef } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { MessageService } from '../services/message.service';
import { ChannelService } from '../services/channel.service';
import { NotificationService } from '../services/notification.service';
import { CreateMessageDto } from '../dto/message.dto';
import { PresenceResponseDto } from '../dto/presence.dto';
import { NotificationResponseDto } from '../dto/notification.dto';
import { PresenceService } from '../services/presence.service';
import { PresenceStatus, UserRole } from '../entities';
import { CallResponseDto } from '../dto/call.dto';

interface JwtPayload {
  email: string;
  sub: string;
  role: string;
}

interface AuthenticatedSocket extends Socket {
  userId?: string;
  user?: JwtPayload;
}

@WebSocketGateway({
  cors: {
    origin: '*',
    methods: ['GET', 'POST'],
    credentials: true,
  },
  namespace: '/',
})
export class ChatGateway
  implements OnGatewayConnection, OnGatewayDisconnect, OnGatewayInit
{
  @WebSocketServer()
  server: Server;

  private readonly logger = new Logger(ChatGateway.name);
  private connectedUsers = new Map<string, Set<string>>(); // userId -> Set of socketIds
  private userChannels = new Map<string, Set<string>>(); // userId -> Set of channelIds
  private isReconcileInProgress = false;
  private recentlyConnected = new Map<string, number>(); // socketId -> timestamp
  private pendingEmits: Array<{
    userId: string;
    event: string;
    data: unknown;
  }> = [];
  private pendingByUser = new Map<
    string,
    Array<{ event: string; data: unknown }>
  >();

  constructor(
    private messageService: MessageService,
    private jwtService: JwtService,
    private channelService: ChannelService,
    private presenceService: PresenceService,
    @Inject(forwardRef(() => NotificationService))
    private notificationService: NotificationService,
  ) {
    // DON'T register callback here - server isn't ready yet
  }

  afterInit(server: Server) {
    this.server = server;
    this.logger.log('WebSocket server initialized');

    // Register callback AFTER server is initialized
    this.notificationService.setNotificationCreatedCallback(
      (userId: string, notification: NotificationResponseDto) => {
        this.sendToUser(userId, 'notification_created', notification);
      },
    );

    this.flushPendingEmits();
  }

  async handleConnection(client: AuthenticatedSocket) {
    this.logger.log(
      `[handleConnection] Client ${client.id} attempting to connect`,
    );
    try {
      const authToken = client.handshake.auth?.token as unknown;
      const authHeader = client.handshake.headers?.authorization as unknown;

      const token =
        (typeof authToken === 'string' ? authToken : null) ||
        (typeof authHeader === 'string'
          ? authHeader.replace('Bearer ', '')
          : null);

      this.logger.debug(
        `WebSocket handshake for socket ${client.id}: token present = ${Boolean(token)}`,
      );

      if (!token) {
        this.logger.warn(
          `[handleConnection] Client ${client.id} connected without token, disconnecting`,
        );
        client.disconnect();
        return;
      }

      this.logger.log(
        `[handleConnection] Client ${client.id} has token, verifying JWT`,
      );
      const payload = this.jwtService.verify<JwtPayload>(token);
      this.logger.log(
        `[handleConnection] Client ${client.id} JWT verified, userId: ${payload.sub}`,
      );
      client.userId = payload.sub;
      client.user = payload;

      this.logger.debug(
        `WebSocket authenticated payload for socket ${client.id}: ${JSON.stringify(payload)}`,
      );

      if (!client.userId) {
        client.disconnect();
        return;
      }

      // Track connected user
      if (!this.connectedUsers.has(client.userId)) {
        this.connectedUsers.set(client.userId, new Set());
      }
      this.connectedUsers.get(client.userId)!.add(client.id);

      // Mark socket as recently connected (protect from immediate reconciliation)
      this.recentlyConnected.set(client.id, Date.now());
      setTimeout(() => {
        this.recentlyConnected.delete(client.id);
      }, 5000); // 5 second grace period

      this.logger.log(
        `User ${client.userId} connected with socket ${client.id}. Total connected users: ${this.connectedUsers.size}`,
      );

      // Join user to their channels
      await this.joinUserChannels(client);

      // Broadcast user online status and share snapshot with newly connected user
      const presence = await this.presenceService.setAutomaticStatus(
        client.userId,
        PresenceStatus.ONLINE,
      );
      this.publishPresenceUpdate(presence);

      await this.sendPresenceSnapshot(client.userId);

      this.flushUserPending(client.userId);

      // Don't call reconcileConnections immediately - it can clear newly connected sockets
      // that aren't yet in server.sockets.sockets map
    } catch (error) {
      const errorMessage =
        error instanceof Error
          ? `${error.name}: ${error.message}`
          : 'Unknown error';
      this.logger.error(
        `Authentication failed for socket ${client.id}: ${errorMessage}`,
      );
      if (error instanceof Error && error.stack) {
        this.logger.debug(error.stack);
      }
      client.disconnect();
    }
  }

  async handleDisconnect(client: AuthenticatedSocket) {
    await Promise.resolve();
    if (client.userId) {
      const userSockets = this.connectedUsers.get(client.userId);
      if (userSockets) {
        userSockets.delete(client.id);

        // Clean up recently connected tracking
        this.recentlyConnected.delete(client.id);

        // If user has no more connections, mark as offline
        if (userSockets.size === 0) {
          this.connectedUsers.delete(client.userId);
          this.userChannels.delete(client.userId);
          const presence = await this.presenceService.setAutomaticStatus(
            client.userId,
            PresenceStatus.OFFLINE,
          );
          this.publishPresenceUpdate(presence);
        }
      }

      this.logger.log(
        `User ${client.userId} disconnected from socket ${client.id}`,
      );
    }

    // TEMPORARILY DISABLED - reconcileConnections causes race conditions
    // void this.reconcileConnections();
  }

  @SubscribeMessage('join_channel')
  async handleJoinChannel(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() data: { channelId: string },
  ) {
    try {
      const userRole = this.resolveUserRole(client);
      // Verify user has access to channel
      await this.channelService.findOne(
        data.channelId,
        client.userId!,
        userRole,
      );

      // Join socket to channel room
      await client.join(`channel_${data.channelId}`);

      // Track user channels
      if (!this.userChannels.has(client.userId!)) {
        this.userChannels.set(client.userId!, new Set());
      }
      this.userChannels.get(client.userId!)!.add(data.channelId);

      const roomSize =
        this.server.sockets.adapter.rooms.get(`channel_${data.channelId}`)
          ?.size ?? 0;
      this.logger.log(
        `User ${client.userId} joined channel ${data.channelId}. Room now has ${roomSize} members.`,
      );

      // Notify channel members that user joined
      client.to(`channel_${data.channelId}`).emit('user_joined_channel', {
        userId: client.userId,
        channelId: data.channelId,
        user: client.user,
      });
    } catch (error) {
      client.emit('error', {
        message: 'Failed to join channel',
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }

  @SubscribeMessage('leave_channel')
  async handleLeaveChannel(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() data: { channelId: string },
  ) {
    await client.leave(`channel_${data.channelId}`);

    // Remove from user channels tracking
    const userChannels = this.userChannels.get(client.userId!);
    if (userChannels) {
      userChannels.delete(data.channelId);
    }

    this.logger.log(`User ${client.userId} left channel ${data.channelId}`);

    // Notify channel members that user left
    client.to(`channel_${data.channelId}`).emit('user_left_channel', {
      userId: client.userId,
      channelId: data.channelId,
    });
  }

  @SubscribeMessage('send_message')
  async handleSendMessage(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() createMessageDto: CreateMessageDto,
  ) {
    try {
      const message = await this.messageService.create(
        createMessageDto,
        client.userId!,
      );

      const roomName = `channel_${createMessageDto.channelId}`;
      const room = this.server.sockets.adapter.rooms.get(roomName);
      const roomSize = room?.size ?? 0;
      const roomMembers = room ? Array.from(room) : [];

      this.logger.log(
        `Broadcasting new_message to room ${roomName} with ${roomSize} members: ${roomMembers.join(', ')}`,
      );
      this.logger.log(`Message content: "${message.content}"`);

      // Broadcast message to all channel members INCLUDING the sender
      this.server.in(roomName).emit('new_message', message);

      this.logger.log(`Event emitted to ${roomName}`);

      // Send typing stopped event
      client
        .to(`channel_${createMessageDto.channelId}`)
        .emit('typing_stopped', {
          userId: client.userId,
          channelId: createMessageDto.channelId,
        });

      this.logger.log(
        `Message sent by user ${client.userId} in channel ${createMessageDto.channelId}`,
      );
    } catch (error) {
      client.emit('error', {
        message: 'Failed to send message',
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }

  @SubscribeMessage('typing_start')
  handleTypingStart(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() data: { channelId: string },
  ) {
    client.to(`channel_${data.channelId}`).emit('typing_started', {
      userId: client.userId,
      channelId: data.channelId,
      user: client.user,
    });
  }

  @SubscribeMessage('typing_stop')
  handleTypingStop(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() data: { channelId: string },
  ) {
    client.to(`channel_${data.channelId}`).emit('typing_stopped', {
      userId: client.userId,
      channelId: data.channelId,
    });
  }

  @SubscribeMessage('update_presence')
  async handleUpdatePresence(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody()
    data: { status: string; clearManual?: boolean },
  ) {
    if (!client.userId) {
      return;
    }

    try {
      let presence: PresenceResponseDto | null = null;

      if (data?.clearManual) {
        presence = await this.presenceService.clearManualStatus(
          client.userId,
          this.isUserOnline(client.userId),
        );
      } else if (data?.status) {
        const normalizedStatus = (data.status || '').toLowerCase();
        if (
          !Object.values(PresenceStatus).includes(
            normalizedStatus as PresenceStatus,
          )
        ) {
          throw new Error('Unsupported presence status');
        }
        const status = normalizedStatus as PresenceStatus;
        presence = await this.presenceService.setManualStatus(
          client.userId,
          status,
        );
      }

      if (presence) {
        this.publishPresenceUpdate(presence);
      }
    } catch (error) {
      client.emit('error', {
        message: 'Failed to update presence',
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }

  @SubscribeMessage('start_call')
  async handleStartCall(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() data: { channelId: string; type: 'voice' | 'video' },
  ) {
    try {
      // Create call record in database (would need CallService)
      const callId = `call_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

      // Join call room
      await client.join(`call_${callId}`);

      // Notify channel members about call start
      this.server.to(`channel_${data.channelId}`).emit('call_started', {
        callId,
        channelId: data.channelId,
        initiator: client.user,
        type: data.type,
      });

      client.emit('call_created', { callId });
    } catch (error) {
      client.emit('error', {
        message: 'Failed to start call',
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }

  @SubscribeMessage('join_call')
  async handleJoinCall(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() data: { callId: string },
  ) {
    await client.join(`call_${data.callId}`);

    // Notify other call participants
    client.to(`call_${data.callId}`).emit('user_joined_call', {
      userId: client.userId,
      user: client.user,
      callId: data.callId,
    });

    // Send existing participants to new user
    const callRoom = this.server.sockets.adapter.rooms.get(
      `call_${data.callId}`,
    );
    if (callRoom) {
      const participants = Array.from(callRoom).filter(
        (socketId) => socketId !== client.id,
      );
      client.emit('call_participants', { participants });
    }
  }

  @SubscribeMessage('leave_call')
  async handleLeaveCall(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() data: { callId: string },
  ) {
    await client.leave(`call_${data.callId}`);

    // Notify other call participants
    client.to(`call_${data.callId}`).emit('user_left_call', {
      userId: client.userId,
      callId: data.callId,
    });
  }

  @SubscribeMessage('webrtc_signal')
  handleWebRTCSignal(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody()
    data: {
      callId: string;
      targetUserId: string;
      signal: unknown;
      type: 'offer' | 'answer' | 'ice-candidate';
    },
  ) {
    // Forward WebRTC signaling to target user
    const targetSockets = this.connectedUsers.get(data.targetUserId);
    if (targetSockets) {
      targetSockets.forEach((socketId) => {
        this.server.to(socketId).emit('webrtc_signal', {
          fromUserId: client.userId,
          signal: data.signal,
          type: data.type,
          callId: data.callId,
        });
      });
    }
  }

  @SubscribeMessage('reaction_add')
  async handleAddReaction(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() data: { messageId: string; emoji: string },
  ) {
    try {
      await this.messageService.addReaction(
        { messageId: data.messageId, emoji: data.emoji },
        client.userId!,
      );

      // Broadcast reaction update to channel
      // Would need to get channelId from message
      // For now, emit to all connected users of the user's channels
      const userChannels = this.userChannels.get(client.userId!) || new Set();
      userChannels.forEach((channelId) => {
        this.server.to(`channel_${channelId}`).emit('reaction_updated', {
          messageId: data.messageId,
          emoji: data.emoji,
          userId: client.userId,
          action: 'toggle',
        });
      });
    } catch (error) {
      client.emit('error', {
        message: 'Failed to add reaction',
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }

  private async joinUserChannels(client: AuthenticatedSocket) {
    try {
      const userRole = this.resolveUserRole(client);
      // Get user's DMs
      const dmChannels = await this.channelService.findDirectMessages(
        client.userId!,
        userRole,
      );
      for (const channel of dmChannels) {
        await client.join(`channel_${channel.id}`);

        if (!this.userChannels.has(client.userId!)) {
          this.userChannels.set(client.userId!, new Set());
        }
        this.userChannels.get(client.userId!)!.add(channel.id);
      }
    } catch (error) {
      this.logger.error(
        `Failed to join user channels: ${error instanceof Error ? error.message : 'Unknown error'}`,
      );
    }
  }

  public publishPresenceUpdate(presence: PresenceResponseDto) {
    const userChannels = this.userChannels.get(presence.userId) || new Set();

    const payload = {
      ...presence,
      timestamp: presence.timestamp,
    };

    userChannels.forEach((channelId) => {
      this.server.to(`channel_${channelId}`).emit('presence_updated', payload);
    });

    // Emit globally so workspace UI stays in sync outside shared channels
    this.server.emit('presence_updated', payload);
  }

  private async sendPresenceSnapshot(userId: string) {
    const snapshot = await this.presenceService.getAllPresence();

    if (snapshot.length > 0) {
      this.sendToUser(userId, 'presence_snapshot', snapshot);
    }
  }

  public isUserOnline(userId: string): boolean {
    const sockets = this.connectedUsers.get(userId);
    return Boolean(sockets && sockets.size > 0);
  }

  private async reconcileConnections() {
    if (this.isReconcileInProgress) {
      return;
    }

    this.isReconcileInProgress = true;

    try {
      const entries = Array.from(this.connectedUsers.entries());

      for (const [userId, socketIds] of entries) {
        const activeSocketIds = new Set<string>();

        socketIds.forEach((socketId) => {
          // Skip recently connected sockets - give them time to fully initialize
          if (this.recentlyConnected.has(socketId)) {
            this.logger.debug(
              `Skipping recently connected socket ${socketId} in reconciliation`,
            );
            activeSocketIds.add(socketId);
            return;
          }

          if (this.server?.sockets?.sockets?.has(socketId)) {
            activeSocketIds.add(socketId);
          }
        });

        if (activeSocketIds.size === 0) {
          this.connectedUsers.delete(userId);
          this.userChannels.delete(userId);

          try {
            const presence = await this.presenceService.setAutomaticStatus(
              userId,
              PresenceStatus.OFFLINE,
            );
            this.publishPresenceUpdate(presence);
          } catch (error) {
            const message =
              error instanceof Error ? error.message : String(error);
            this.logger.warn(
              `Failed to mark user ${userId} offline during presence sweep: ${message}`,
            );
          }

          continue;
        }

        if (activeSocketIds.size !== socketIds.size) {
          this.connectedUsers.set(userId, activeSocketIds);
        }
      }
    } catch (error) {
      this.logger.debug(
        `Presence reconciliation error: ${error instanceof Error ? error.message : error}`,
      );
    } finally {
      this.isReconcileInProgress = false;
    }
  }

  // Method to send message to specific user (for notifications, etc.)
  sendToUser(userId: string, event: string, data: unknown) {
    if (!this.server) {
      this.logger.warn(
        `Cannot send ${event} to user ${userId}: WebSocket server not initialized yet. Queuing event.`,
      );
      this.pendingEmits.push({ userId, event, data });
      return;
    }

    const userSockets = this.connectedUsers.get(userId);
    if (userSockets) {
      this.logger.log(
        `Sending ${event} to user ${userId} (${userSockets.size} sockets)`,
      );
      userSockets.forEach((socketId) => {
        this.server.to(socketId).emit(event, data);
      });
    } else {
      this.logger.warn(
        `User ${userId} not connected, queueing ${event}. Connected users: ${Array.from(this.connectedUsers.keys()).join(', ')}`,
      );
      if (!this.pendingByUser.has(userId)) {
        this.pendingByUser.set(userId, []);
      }
      this.pendingByUser.get(userId)!.push({ event, data });
    }
  }

  private flushPendingEmits() {
    if (!this.server || this.pendingEmits.length === 0) {
      return;
    }
    const pending = [...this.pendingEmits];
    this.pendingEmits.length = 0;
    pending.forEach(({ userId, event, data }) => {
      this.sendToUser(userId, event, data);
    });
  }

  private flushUserPending(userId: string) {
    this.flushPendingEmits();
    const pendingForUser = this.pendingByUser.get(userId);
    if (!pendingForUser || pendingForUser.length === 0) {
      return;
    }
    this.logger.log(
      `Flushing ${pendingForUser.length} queued events for user ${userId}`,
    );
    this.pendingByUser.delete(userId);
    pendingForUser.forEach(({ event, data }) => {
      this.sendToUser(userId, event, data);
    });
  }

  public publishCallUpdate(
    payload: CallResponseDto,
    recipients: Iterable<string>,
  ): void {
    const uniqueRecipients = new Set(
      Array.from(recipients || []).filter((userId) => Boolean(userId)),
    );

    uniqueRecipients.forEach((userId) => {
      this.sendToUser(userId, 'call_updated', payload);
    });
  }

  public publishProjectUpdate(
    event: string,
    payload: any,
    recipients: Iterable<string>,
  ): void {
    const uniqueRecipients = new Set(
      Array.from(recipients || []).filter((userId) => Boolean(userId)),
    );

    this.logger.log(
      `Broadcasting ${event} to ${uniqueRecipients.size} recipients: ${Array.from(uniqueRecipients).join(', ')}`,
    );
    uniqueRecipients.forEach((userId) => {
      this.sendToUser(userId, event, payload);
    });
  }

  private resolveUserRole(client: AuthenticatedSocket): UserRole {
    const role = client.user?.role;
    if (role && (Object.values(UserRole) as string[]).includes(role)) {
      return role as UserRole;
    }
    return UserRole.TEAM_MEMBER;
  }

  // Method to send message to channel
  sendToChannel(channelId: string, event: string, data: any) {
    this.server.to(`channel_${channelId}`).emit(event, data);
  }

  @SubscribeMessage('quality_report')
  handleQualityReport(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody()
    data: {
      callId: string;
      metrics: {
        audio?: { packetsLost: number; jitter: number };
        video?: { packetsLost: number; frameRate: number; resolution: string };
        connection?: { rtt: number; bandwidth: number };
      };
    },
  ) {
    try {
      // Store quality metrics (in production, would save to database)
      this.logger.log(
        `Quality report from ${client.userId} for call ${data.callId}:`,
        data.metrics,
      );

      // Could emit to call moderator or admin interface
      client.to(`call_${data.callId}`).emit('quality_metrics_updated', {
        userId: client.userId,
        metrics: data.metrics,
        timestamp: new Date(),
      });
    } catch (error) {
      client.emit('error', {
        message: 'Failed to process quality report',
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }

  @SubscribeMessage('mark_messages_read')
  async handleMarkMessagesRead(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody()
    data: {
      channelId: string;
      upToMessageId?: string;
    },
  ) {
    try {
      await this.channelService.markMessagesAsRead(
        data.channelId,
        client.userId!,
        this.resolveUserRole(client),
        data.upToMessageId,
      );

      // Broadcast to channel that user has read messages
      client.to(`channel_${data.channelId}`).emit('messages_read', {
        userId: client.userId,
        channelId: data.channelId,
        upToMessageId: data.upToMessageId,
        timestamp: new Date(),
      });

      client.emit('messages_marked_read', {
        channelId: data.channelId,
        success: true,
      });
    } catch (error) {
      client.emit('error', {
        message: 'Failed to mark messages as read',
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }
}
