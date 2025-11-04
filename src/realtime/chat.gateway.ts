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
import { MessageService } from '../messages/message.service';
import { ChannelService } from '../channels/channel.service';
import { NotificationService } from '../notifications/notification.service';
import { CreateMessageDto } from '../dto/message.dto';
import { PresenceResponseDto } from '../dto/presence.dto';
import { NotificationResponseDto } from '../dto/notification.dto';
import { PresenceService } from '../presence/presence.service';
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
  private connectedUsers = new Map<string, Set<string>>();
  private userChannels = new Map<string, Set<string>>();
  private recentlyConnected = new Map<string, number>();
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
    @Inject(forwardRef(() => ChannelService))
    private channelService: ChannelService,
    private presenceService: PresenceService,
    @Inject(forwardRef(() => NotificationService))
    private notificationService: NotificationService,
  ) {}

  afterInit(server: Server) {
    this.server = server;
    this.logger.log('WebSocket server initialized');

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

      const hadExistingSockets =
        this.connectedUsers.has(client.userId) &&
        this.connectedUsers.get(client.userId)!.size > 0;

      if (!this.connectedUsers.has(client.userId)) {
        this.connectedUsers.set(client.userId, new Set());
      }
      this.connectedUsers.get(client.userId)!.add(client.id);

      this.recentlyConnected.set(client.id, Date.now());
      setTimeout(() => {
        this.recentlyConnected.delete(client.id);
      }, 5000);

      this.logger.log(
        `User ${client.userId} connected with socket ${client.id}. Total connected users: ${this.connectedUsers.size}`,
      );

      await this.joinUserChannels(client);

      const wasOffline = !hadExistingSockets;

      if (wasOffline) {
        const presence = await this.presenceService.setAutomaticStatus(
          client.userId,
          PresenceStatus.ONLINE,
        );
        this.publishPresenceUpdate(presence);
      }

      await this.sendPresenceSnapshotToSocket(client.id);

      this.flushUserPending(client.userId);
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

        this.recentlyConnected.delete(client.id);

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
  }

  @SubscribeMessage('join_channel')
  async handleJoinChannel(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() data: { channelId: string },
  ) {
    try {
      const userRole = this.resolveUserRole(client);
      await this.channelService.findOne(
        data.channelId,
        client.userId!,
        userRole,
      );

      await client.join(`channel_${data.channelId}`);

      if (!this.userChannels.has(client.userId!)) {
        this.userChannels.set(client.userId!, new Set());
      }
      this.userChannels.get(client.userId!)!.add(data.channelId);

      const roomSize =
        this.server?.sockets?.adapter?.rooms?.get(`channel_${data.channelId}`)
          ?.size ?? 0;
      this.logger.log(
        `User ${client.userId} joined channel ${data.channelId}. Room now has ${roomSize} members.`,
      );

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

    const userChannels = this.userChannels.get(client.userId!);
    if (userChannels) {
      userChannels.delete(data.channelId);
    }

    this.logger.log(`User ${client.userId} left channel ${data.channelId}`);

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
      const room = this.server?.sockets?.adapter?.rooms?.get(roomName);
      const roomSize = room?.size ?? 0;
      const roomMembers = room ? Array.from(room) : [];

      this.logger.log(
        `Broadcasting new_message to room ${roomName} with ${roomSize} members: ${roomMembers.join(', ')}`,
      );
      this.logger.log(`Message content: "${message.content}"`);

      this.server.in(roomName).emit('new_message', message);

      this.logger.log(`Event emitted to ${roomName}`);

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
      const callId = `call_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

      await client.join(`call_${callId}`);

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

    client.to(`call_${data.callId}`).emit('user_joined_call', {
      userId: client.userId,
      user: client.user,
      callId: data.callId,
    });

    const callRoom = this.server?.sockets?.adapter?.rooms?.get(
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
      const { channelId } = await this.messageService.addReaction(
        { messageId: data.messageId, emoji: data.emoji },
        client.userId!,
      );

      this.server.to(`channel_${channelId}`).emit('reaction_updated', {
        messageId: data.messageId,
        emoji: data.emoji,
        userId: client.userId,
        action: 'toggle',
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

    this.server.emit('presence_updated', payload);
  }

  private async sendPresenceSnapshotToSocket(socketId: string) {
    const snapshot = await this.presenceService.getAllPresence();

    if (snapshot.length > 0 && this.server) {
      this.server.to(socketId).emit('presence_snapshot', snapshot);
    }
  }

  public isUserOnline(userId: string): boolean {
    const sockets = this.connectedUsers.get(userId);
    return Boolean(sockets && sockets.size > 0);
  }

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

  public publishIncomingCall(
    callData: CallResponseDto,
    recipientUserId: string,
  ): void {
    this.logger.log(
      `Publishing incoming_call to user ${recipientUserId} for call ${callData.id}`,
    );
    this.sendToUser(recipientUserId, 'incoming_call', callData);
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

  public broadcastToUsers(
    event: string,
    payload: unknown,
    recipients: Iterable<string>,
  ): void {
    const uniqueRecipients = new Set(
      Array.from(recipients || []).filter((userId) => Boolean(userId)),
    );

    if (uniqueRecipients.size === 0) {
      return;
    }

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
      this.logger.log(
        `Quality report from ${client.userId} for call ${data.callId}:`,
        data.metrics,
      );

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
