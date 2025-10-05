import {
  WebSocketGateway,
  SubscribeMessage,
  MessageBody,
  WebSocketServer,
  ConnectedSocket,
  OnGatewayConnection,
  OnGatewayDisconnect,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { Logger } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { MessageService } from '../services/message.service';
import { MediaService } from '../services/media.service';
import { RecordingService } from '../services/recording.service';
import { CreateMessageDto } from '../dto/message.dto';

interface JwtPayload {
  email: string;
  sub: string;
  role: string;
}

// Stub interface for missing ChannelService (gateway needs fewer methods)
interface ChannelService {
  findOne(id: string, userId: string): Promise<{ id: string }>;
  findDirectMessages(userId: string): Promise<{ id: string }[]>;
}

// Stub implementation for missing ChannelService
class ChannelServiceStub implements ChannelService {
  async findOne(): Promise<{ id: string }> {
    return await Promise.reject(new Error('ChannelService not implemented'));
  }

  async findDirectMessages(): Promise<{ id: string }[]> {
    return await Promise.reject(new Error('ChannelService not implemented'));
  }
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
export class ChatGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server: Server;

  private readonly logger = new Logger(ChatGateway.name);
  private connectedUsers = new Map<string, Set<string>>(); // userId -> Set of socketIds
  private userChannels = new Map<string, Set<string>>(); // userId -> Set of channelIds

  private readonly channelService: ChannelService;

  constructor(
    private messageService: MessageService,
    private jwtService: JwtService,
    private mediaService: MediaService,
    private recordingService: RecordingService,
  ) {
    this.channelService = new ChannelServiceStub();
  }

  async handleConnection(client: AuthenticatedSocket) {
    try {
      const authToken = client.handshake.auth?.token as unknown;
      const authHeader = client.handshake.headers?.authorization as unknown;

      const token =
        (typeof authToken === 'string' ? authToken : null) ||
        (typeof authHeader === 'string'
          ? authHeader.replace('Bearer ', '')
          : null);

      if (!token) {
        this.logger.warn('Client connected without token');
        client.disconnect();
        return;
      }

      const payload = this.jwtService.verify<JwtPayload>(token);
      client.userId = payload.sub;
      client.user = payload;

      if (!client.userId) {
        client.disconnect();
        return;
      }

      // Track connected user
      if (!this.connectedUsers.has(client.userId)) {
        this.connectedUsers.set(client.userId, new Set());
      }
      this.connectedUsers.get(client.userId)!.add(client.id);

      // Join user to their channels
      await this.joinUserChannels(client);

      // Broadcast user online status
      this.broadcastPresenceUpdate(client.userId, 'online');

      this.logger.log(
        `User ${client.userId} connected with socket ${client.id}`,
      );
    } catch (error) {
      this.logger.error(
        'Authentication failed:',
        error instanceof Error ? error.message : 'Unknown error',
      );
      client.disconnect();
    }
  }

  async handleDisconnect(client: AuthenticatedSocket) {
    await Promise.resolve();
    if (client.userId) {
      const userSockets = this.connectedUsers.get(client.userId);
      if (userSockets) {
        userSockets.delete(client.id);

        // If user has no more connections, mark as offline
        if (userSockets.size === 0) {
          this.connectedUsers.delete(client.userId);
          this.broadcastPresenceUpdate(client.userId, 'offline');
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
      // Verify user has access to channel
      await this.channelService.findOne(data.channelId, client.userId!);

      // Join socket to channel room
      await client.join(`channel_${data.channelId}`);

      // Track user channels
      if (!this.userChannels.has(client.userId!)) {
        this.userChannels.set(client.userId!, new Set());
      }
      this.userChannels.get(client.userId!)!.add(data.channelId);

      this.logger.log(`User ${client.userId} joined channel ${data.channelId}`);

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

      // Broadcast message to all channel members
      this.server
        .to(`channel_${createMessageDto.channelId}`)
        .emit('new_message', message);

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
  handleUpdatePresence(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() data: { status: string; customStatus?: string },
  ) {
    // Update presence in database would be handled by a presence service
    this.broadcastPresenceUpdate(
      client.userId!,
      data.status,
      data.customStatus,
    );
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
      // Get user's DMs
      const dmChannels = await this.channelService.findDirectMessages(
        client.userId!,
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

  private broadcastPresenceUpdate(
    userId: string,
    status: string,
    customStatus?: string,
  ) {
    // Get all channels this user is in and broadcast to those channels
    const userChannels = this.userChannels.get(userId) || new Set();

    const presenceUpdate = {
      userId,
      status,
      customStatus,
      timestamp: new Date(),
    };

    userChannels.forEach((channelId) => {
      this.server
        .to(`channel_${channelId}`)
        .emit('presence_updated', presenceUpdate);
    });
  }

  // Method to send message to specific user (for notifications, etc.)
  sendToUser(userId: string, event: string, data: any) {
    const userSockets = this.connectedUsers.get(userId);
    if (userSockets) {
      userSockets.forEach((socketId) => {
        this.server.to(socketId).emit(event, data);
      });
    }
  }

  // Method to send message to channel
  sendToChannel(channelId: string, event: string, data: any) {
    this.server.to(`channel_${channelId}`).emit(event, data);
  }

  // Media-related WebSocket handlers
  @SubscribeMessage('media_join_room')
  handleMediaJoinRoom(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody()
    data: {
      callId: string;
      options?: { audio: boolean; video: boolean; screen: boolean };
    },
  ) {
    try {
      const result = this.mediaService.joinRoom(
        data.callId,
        client.userId!,
        data.options || { audio: true, video: true, screen: false },
      );

      client.emit('media_session_created', { session: result.sessionInfo });
      client.to(`call_${data.callId}`).emit('media_user_joined', {
        userId: client.userId,
        sessionId: result.sessionInfo?.roomId || data.callId,
      });
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      client.emit('error', {
        message: 'Failed to join media room',
        error: errorMessage,
      });
    }
  }

  @SubscribeMessage('media_leave_room')
  handleMediaLeaveRoom(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() data: { callId: string },
  ) {
    try {
      this.mediaService.leaveRoom(data.callId, client.userId!);
      client.to(`call_${data.callId}`).emit('media_user_left', {
        userId: client.userId,
      });
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      client.emit('error', {
        message: 'Failed to leave media room',
        error: errorMessage,
      });
    }
  }

  @SubscribeMessage('screen_share_start')
  handleScreenShareStart(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() data: { callId: string },
  ) {
    try {
      void this.mediaService.startScreenShare(data.callId, client.userId!);
      client.to(`call_${data.callId}`).emit('screen_share_started', {
        userId: client.userId,
      });
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      client.emit('error', {
        message: 'Failed to start screen sharing',
        error: errorMessage,
      });
    }
  }

  @SubscribeMessage('screen_share_stop')
  handleScreenShareStop(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() data: { callId: string },
  ) {
    try {
      this.mediaService.stopScreenShare(data.callId, client.userId!);
      client.to(`call_${data.callId}`).emit('screen_share_stopped', {
        userId: client.userId,
      });
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      client.emit('error', {
        message: 'Failed to stop screen sharing',
        error: errorMessage,
      });
    }
  }

  @SubscribeMessage('recording_start')
  handleRecordingStart(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody()
    data: {
      callId: string;
      format?: string;
      quality?: 'low' | 'medium' | 'high';
    },
  ) {
    try {
      const recording = this.recordingService.startRecording(data.callId, {
        format: data.format,
        quality: data.quality,
      });

      client.emit('recording_started', { recording });
      client.to(`call_${data.callId}`).emit('recording_notification', {
        message: 'Recording started',
        recordingId: recording.id,
        startedBy: client.userId,
      });
    } catch (error) {
      client.emit('error', {
        message: 'Failed to start recording',
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }

  @SubscribeMessage('recording_stop')
  async handleRecordingStop(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() data: { recordingId: string; callId: string },
  ) {
    try {
      const recording = await this.recordingService.stopRecording(
        data.recordingId,
      );

      client.emit('recording_stopped', { recording });
      client.to(`call_${data.callId}`).emit('recording_notification', {
        message: 'Recording stopped',
        recordingId: recording.id,
        stoppedBy: client.userId,
      });
    } catch (error) {
      client.emit('error', {
        message: 'Failed to stop recording',
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
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
}
