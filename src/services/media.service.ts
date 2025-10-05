import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export interface MediaServerSession {
  sessionId: string;
  pluginHandle: string;
  roomId: string;
}

export interface WebRTCConfiguration {
  iceServers: Array<{
    urls: string[];
    username?: string;
    credential?: string;
  }>;
}

export interface MediaRoom {
  id: string;
  name: string;
  participants: string[];
  isActive: boolean;
  createdAt: Date;
  maxParticipants: number;
  screenShareActive?: boolean;
  screenShareUserId?: string | null;
}

export interface QualityMetric {
  userId: string;
  metrics: {
    bitrate: number;
    packetLoss: number;
    jitter: number;
    rtt: number;
  };
  timestamp: Date;
}

export interface RecordingInfo {
  recordingId: string;
  filename: string;
  startTime: Date;
  endTime?: Date;
  size?: number;
  url?: string;
  status?: string;
}

@Injectable()
export class MediaService {
  private readonly logger = new Logger(MediaService.name);
  private activeSessions: Map<string, MediaServerSession> = new Map();
  private mediaRooms: Map<string, MediaRoom> = new Map();
  private qualityMetrics: Map<string, QualityMetric[]> = new Map();

  constructor(private readonly configService: ConfigService) {}

  getWebRTCConfig(): WebRTCConfiguration {
    try {
      const config: WebRTCConfiguration = {
        iceServers: [
          {
            urls: ['stun:stun.l.google.com:19302'],
          },
        ],
      };
      this.logger.log('Generated WebRTC configuration');
      return config;
    } catch (error) {
      this.logger.error(`Failed to get WebRTC config: ${error}`);
      throw new Error('Failed to get WebRTC configuration');
    }
  }

  createMediaRoom(
    name: string,
    options?: { maxParticipants?: number },
  ): string {
    try {
      const roomId = `room_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      const room = {
        id: roomId,
        name,
        participants: [],
        isActive: true,
        createdAt: new Date(),
        maxParticipants: options?.maxParticipants || 10,
      };

      this.mediaRooms.set(roomId, room);
      this.logger.log(`Created media room: ${roomId}`);
      return roomId;
    } catch (error) {
      this.logger.error(`Failed to create media room: ${error}`);
      throw new Error('Failed to create media room');
    }
  }

  getActiveRooms(): MediaRoom[] {
    try {
      const rooms = Array.from(this.mediaRooms.values()).filter(
        (room) => room.isActive,
      );
      this.logger.log(`Retrieved ${rooms.length} active rooms`);
      return rooms;
    } catch (error) {
      this.logger.error(`Failed to get active rooms: ${error}`);
      throw new Error('Failed to get active rooms');
    }
  }

  getMediaRoom(roomId: string): MediaRoom | null {
    try {
      const room = this.mediaRooms.get(roomId);
      if (!room) {
        this.logger.warn(`Room not found: ${roomId}`);
        return null;
      }
      return room;
    } catch (error) {
      this.logger.error(`Failed to get media room: ${error}`);
      throw new Error('Failed to get media room');
    }
  }

  joinRoom(
    roomId: string,
    userId: string,
    mediaConstraints?: { audio: boolean; video: boolean; screen: boolean },
  ): {
    success: boolean;
    sessionInfo?: {
      roomId: string;
      userId: string;
      joinedAt: Date;
      mediaConstraints?: { audio: boolean; video: boolean; screen: boolean };
    };
  } {
    try {
      const room = this.mediaRooms.get(roomId);
      if (!room) {
        throw new Error('Room not found');
      }

      if (room.participants.includes(userId)) {
        this.logger.warn(`User ${userId} already in room ${roomId}`);
        return { success: true };
      }

      room.participants.push(userId);
      const sessionInfo = {
        roomId,
        userId,
        joinedAt: new Date(),
        mediaConstraints,
      };

      this.logger.log(`User ${userId} joined room ${roomId}`);
      return { success: true, sessionInfo };
    } catch (error) {
      this.logger.error(`Failed to join room: ${error}`);
      throw new Error('Failed to join room');
    }
  }

  leaveRoom(roomId: string, userId: string): void {
    try {
      const room = this.mediaRooms.get(roomId);
      if (!room) {
        this.logger.warn(`Room not found: ${roomId}`);
        return;
      }

      const userIndex = room.participants.indexOf(userId);
      if (userIndex > -1) {
        room.participants.splice(userIndex, 1);
        this.logger.log(`User ${userId} left room ${roomId}`);
      }
    } catch (error) {
      this.logger.error(`Failed to leave room: ${error}`);
      throw new Error('Failed to leave room');
    }
  }

  deleteRoom(roomId: string): void {
    try {
      const room = this.mediaRooms.get(roomId);
      if (!room) {
        this.logger.warn(`Room not found: ${roomId}`);
        return;
      }

      room.isActive = false;
      this.mediaRooms.delete(roomId);
      this.logger.log(`Deleted room: ${roomId}`);
    } catch (error) {
      this.logger.error(`Failed to delete room: ${error}`);
      throw new Error('Failed to delete room');
    }
  }

  startScreenShare(roomId: string, userId: string): void {
    try {
      const room = this.mediaRooms.get(roomId);
      if (!room) {
        throw new Error('Room not found');
      }

      if (!room.participants.includes(userId)) {
        throw new Error('User not in room');
      }

      room.screenShareActive = true;
      room.screenShareUserId = userId;
      this.logger.log(
        `Started screen share for user ${userId} in room ${roomId}`,
      );
    } catch (error) {
      this.logger.error(`Failed to start screen share: ${error}`);
      throw error instanceof Error ? error : new Error(String(error));
    }
  }

  stopScreenShare(roomId: string, userId: string): void {
    try {
      const room = this.mediaRooms.get(roomId);
      if (!room) {
        this.logger.warn(`Room not found: ${roomId}`);
        return;
      }

      if (room.screenShareUserId === userId) {
        room.screenShareActive = false;
        room.screenShareUserId = null;
        this.logger.log(
          `Stopped screen share for user ${userId} in room ${roomId}`,
        );
      }
    } catch (error) {
      this.logger.error(`Failed to stop screen share: ${error}`);
      throw new Error('Failed to stop screen share');
    }
  }

  getCallQualityMetrics(roomId: string): QualityMetric[] {
    try {
      const metrics = this.qualityMetrics.get(roomId) || [];
      this.logger.log(
        `Retrieved ${metrics.length} quality metrics for room ${roomId}`,
      );
      return metrics;
    } catch (error) {
      this.logger.error(`Failed to get quality metrics: ${error}`);
      throw new Error('Failed to get quality metrics');
    }
  }

  recordQualityMetrics(
    roomId: string,
    userId: string,
    metrics: {
      bitrate: number;
      packetLoss: number;
      jitter: number;
      rtt: number;
    },
  ): void {
    try {
      if (!this.qualityMetrics.has(roomId)) {
        this.qualityMetrics.set(roomId, []);
      }

      const roomMetrics = this.qualityMetrics.get(roomId)!;
      roomMetrics.push({
        userId,
        metrics,
        timestamp: new Date(),
      });

      // Keep only last 100 metrics per room
      if (roomMetrics.length > 100) {
        roomMetrics.shift();
      }

      this.logger.log(
        `Recorded quality metrics for user ${userId} in room ${roomId}`,
      );
    } catch (error) {
      this.logger.error(`Failed to record quality metrics: ${error}`);
      throw new Error('Failed to record quality metrics');
    }
  }

  initializeMediaServer(): void {
    try {
      this.logger.log('Media server initialized');
    } catch (error) {
      this.logger.error(`Failed to initialize media server: ${error}`);
      throw error instanceof Error ? error : new Error(String(error));
    }
  }

  cleanupSession(sessionId: string): void {
    try {
      this.activeSessions.delete(sessionId);
      this.logger.log(`Cleaned up session: ${sessionId}`);
    } catch (error) {
      this.logger.error(`Failed to cleanup session: ${error}`);
      throw error instanceof Error ? error : new Error(String(error));
    }
  }
}
