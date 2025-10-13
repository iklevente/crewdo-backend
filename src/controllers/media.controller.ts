import {
  Body,
  Controller,
  Delete,
  Get,
  HttpException,
  HttpStatus,
  Logger,
  Param,
  Post,
  UseGuards,
  Request,
} from '@nestjs/common';
import {
  ApiOperation,
  ApiResponse,
  ApiTags,
  ApiBearerAuth,
} from '@nestjs/swagger';
import { MediaService } from '../services/media.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';

interface AuthenticatedRequest {
  user: {
    id: string;
    email: string;
    role: string;
  };
}
import {
  CreateMediaRoomDto,
  JoinRoomDto,
  LeaveRoomDto,
  ScreenShareDto,
  QualityMetricsDto,
  MediaRoomResponseDto,
  QualityMetricsResponseDto,
} from '../dto/media.dto';

export interface WebRTCConfiguration {
  iceServers: Array<{
    urls: string[];
    username?: string;
    credential?: string;
  }>;
}

export interface MediaRoom {
  id: string;
  participants: string[];
  isActive: boolean;
  createdAt: Date;
  createdBy: string;
}

export interface QualityMetrics {
  bitrate: number;
  packetLoss: number;
  jitter: number;
  rtt: number;
  timestamp: Date;
}

@ApiTags('media')
@Controller('media')
@UseGuards(JwtAuthGuard, RolesGuard)
@ApiBearerAuth()
export class MediaController {
  private readonly logger = new Logger(MediaController.name);

  constructor(private readonly mediaService: MediaService) {}

  @Get('webrtc-config')
  @ApiOperation({ summary: 'Get WebRTC configuration for clients' })
  @ApiResponse({ status: 200, description: 'WebRTC configuration returned' })
  getWebRTCConfig(): WebRTCConfiguration {
    try {
      const config: WebRTCConfiguration = this.mediaService.getWebRTCConfig();
      this.logger.log('WebRTC configuration requested');
      return config;
    } catch (error) {
      this.logger.error(`Failed to get WebRTC config: ${error}`);
      throw new HttpException(
        'Failed to get WebRTC configuration',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  @Post('rooms')
  @ApiOperation({ summary: 'Create a new media room' })
  @ApiResponse({
    status: 201,
    description: 'Media room created',
    type: MediaRoomResponseDto,
  })
  createRoom(
    @Body() createRoomDto: CreateMediaRoomDto,
    @Request() req: AuthenticatedRequest,
  ): Promise<MediaRoom> {
    try {
      this.logger.log(
        `User ${req.user.id} creating media room: ${createRoomDto.name}`,
      );
      const roomId = this.mediaService.createMediaRoom(
        createRoomDto.name,
        req.user.id,
        {
          maxParticipants: createRoomDto.maxParticipants,
        },
      );
      const room = this.mediaService.getMediaRoom(roomId);
      if (!room) {
        throw new Error('Failed to retrieve created room');
      }
      const mediaRoom: MediaRoom = {
        id: room.id,
        participants: room.participants,
        isActive: room.isActive,
        createdAt: room.createdAt,
        createdBy: room.createdBy,
      };
      this.logger.log(`Created media room: ${roomId}`);
      return Promise.resolve(mediaRoom);
    } catch (error) {
      this.logger.error(`Failed to create room: ${error}`);
      throw new HttpException(
        'Failed to create media room',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  @Get('rooms')
  @ApiOperation({ summary: 'Get all active media rooms' })
  @ApiResponse({ status: 200, description: 'Active media rooms returned' })
  getRooms(@Request() req: AuthenticatedRequest): MediaRoom[] {
    try {
      this.logger.log(`User ${req.user.id} requesting active rooms`);
      const serviceRooms = this.mediaService.getActiveRooms();
      const rooms: MediaRoom[] = serviceRooms.map((room) => ({
        id: room.id,
        participants: room.participants,
        isActive: room.isActive,
        createdAt: room.createdAt,
        createdBy: room.createdBy,
      }));
      this.logger.log(`Retrieved ${rooms.length} active rooms`);
      return rooms;
    } catch (error) {
      this.logger.error(`Failed to get rooms: ${error}`);
      throw new HttpException(
        'Failed to get media rooms',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  @Get('rooms/:roomId')
  @ApiOperation({ summary: 'Get specific media room details' })
  @ApiResponse({ status: 200, description: 'Media room details returned' })
  getRoom(@Param('roomId') roomId: string): Promise<MediaRoom> {
    try {
      const serviceRoom = this.mediaService.getMediaRoom(roomId);
      if (!serviceRoom) {
        throw new HttpException('Room not found', HttpStatus.NOT_FOUND);
      }
      const room: MediaRoom = {
        id: serviceRoom.id,
        participants: serviceRoom.participants,
        isActive: serviceRoom.isActive,
        createdAt: serviceRoom.createdAt,
        createdBy: serviceRoom.createdBy,
      };
      this.logger.log(`Retrieved room details for: ${roomId}`);
      return Promise.resolve(room);
    } catch (error) {
      this.logger.error(`Failed to get room ${roomId}: ${error}`);
      if (error instanceof HttpException) {
        throw error;
      }
      throw new HttpException(
        'Failed to get room details',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  @Post('rooms/:roomId/join')
  @ApiOperation({ summary: 'Join a media room' })
  @ApiResponse({ status: 200, description: 'Successfully joined room' })
  joinRoom(
    @Param('roomId') roomId: string,
    @Body() joinDto: JoinRoomDto,
  ): Promise<{ success: boolean; sessionInfo?: any }> {
    try {
      const result = this.mediaService.joinRoom(
        roomId,
        joinDto.userId,
        joinDto.mediaConstraints as
          | { audio: boolean; video: boolean; screen: boolean }
          | undefined,
      );
      this.logger.log(`User ${joinDto.userId} joined room ${roomId}`);
      return Promise.resolve(result);
    } catch (error) {
      this.logger.error(`Failed to join room ${roomId}: ${error}`);
      throw new HttpException(
        'Failed to join media room',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  @Post('rooms/:roomId/leave')
  @ApiOperation({ summary: 'Leave a media room' })
  @ApiResponse({ status: 200, description: 'Successfully left room' })
  leaveRoom(
    @Param('roomId') roomId: string,
    @Body() leaveDto: LeaveRoomDto,
  ): Promise<{ success: boolean }> {
    try {
      this.mediaService.leaveRoom(roomId, leaveDto.userId);
      this.logger.log(`User ${leaveDto.userId} left room ${roomId}`);
      return Promise.resolve({ success: true });
    } catch (error) {
      this.logger.error(`Failed to leave room ${roomId}: ${error}`);
      throw new HttpException(
        'Failed to leave media room',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  @Delete('rooms/:roomId')
  @ApiOperation({
    summary: 'Delete a media room (creator, admin, or project manager only)',
  })
  @ApiResponse({ status: 200, description: 'Media room deleted' })
  @ApiResponse({
    status: 403,
    description:
      'Forbidden - Only room creator, admin, or project manager can delete',
  })
  deleteRoom(
    @Param('roomId') roomId: string,
    @Request() req: AuthenticatedRequest,
  ): Promise<{ success: boolean }> {
    try {
      // Service validates user has permission to delete this room
      // (room creator, admin, or project manager)
      if (
        !this.mediaService.canDeleteRoom(roomId, req.user.id, req.user.role)
      ) {
        this.logger.warn(
          `User ${req.user.id} attempted to delete room ${roomId} without permission`,
        );
        throw new HttpException(
          'You can only delete rooms you created, or you must be an admin/project manager',
          HttpStatus.FORBIDDEN,
        );
      }

      this.logger.log(`User ${req.user.id} deleting room: ${roomId}`);
      this.mediaService.deleteRoom(roomId);
      this.logger.log(`Deleted room: ${roomId}`);
      return Promise.resolve({ success: true });
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }
      this.logger.error(`Failed to delete room ${roomId}: ${error}`);
      throw new HttpException(
        'Failed to delete media room',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  @Post('rooms/:roomId/screen-share/start')
  @ApiOperation({ summary: 'Start screen sharing in a room' })
  @ApiResponse({ status: 200, description: 'Screen sharing started' })
  startScreenShare(
    @Param('roomId') roomId: string,
    @Body() screenShareDto: ScreenShareDto,
  ): Promise<{ success: boolean; streamId?: string }> {
    try {
      this.mediaService.startScreenShare(roomId, screenShareDto.userId);
      this.logger.log(
        `Started screen share for user ${screenShareDto.userId} in room ${roomId}`,
      );
      return Promise.resolve({ success: true });
    } catch (error) {
      this.logger.error(`Failed to start screen share: ${error}`);
      throw new HttpException(
        'Failed to start screen sharing',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  @Post('rooms/:roomId/screen-share/stop')
  @ApiOperation({ summary: 'Stop screen sharing in a room' })
  @ApiResponse({ status: 200, description: 'Screen sharing stopped' })
  stopScreenShare(
    @Param('roomId') roomId: string,
    @Body() stopDto: ScreenShareDto,
  ): Promise<{ success: boolean }> {
    try {
      this.mediaService.stopScreenShare(roomId, stopDto.userId);
      this.logger.log(
        `Stopped screen share for user ${stopDto.userId} in room ${roomId}`,
      );
      return Promise.resolve({ success: true });
    } catch (error) {
      this.logger.error(`Failed to stop screen share: ${error}`);
      throw new HttpException(
        'Failed to stop screen sharing',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  @Get('rooms/:roomId/quality')
  @ApiOperation({ summary: 'Get quality metrics for a room' })
  @ApiResponse({
    status: 200,
    description: 'Quality metrics returned',
    type: [QualityMetricsResponseDto],
  })
  getRoomQuality(@Param('roomId') roomId: string): Promise<QualityMetrics[]> {
    try {
      const serviceMetrics = this.mediaService.getCallQualityMetrics(roomId);
      const metrics: QualityMetrics[] = serviceMetrics.map((metric) => ({
        bitrate: metric.metrics.bitrate,
        packetLoss: metric.metrics.packetLoss,
        jitter: metric.metrics.jitter,
        rtt: metric.metrics.rtt,
        timestamp: metric.timestamp,
      }));
      this.logger.log(`Retrieved quality metrics for room ${roomId}`);
      return Promise.resolve(metrics);
    } catch (error) {
      this.logger.error(`Failed to get quality metrics: ${error}`);
      throw new HttpException(
        'Failed to get quality metrics',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  @Post('rooms/:roomId/quality/report')
  @ApiOperation({ summary: 'Report quality metrics from client' })
  @ApiResponse({ status: 200, description: 'Quality metrics recorded' })
  reportQuality(
    @Param('roomId') roomId: string,
    @Body() qualityDto: QualityMetricsDto,
  ): Promise<{ success: boolean }> {
    try {
      this.mediaService.recordQualityMetrics(roomId, qualityDto.userId, {
        bitrate: qualityDto.metrics.bitrate,
        packetLoss: qualityDto.metrics.packetLoss,
        jitter: qualityDto.metrics.jitter,
        rtt: qualityDto.metrics.rtt,
      });
      this.logger.log(`Recorded quality metrics for room ${roomId}`);
      return Promise.resolve({ success: true });
    } catch (error) {
      this.logger.error(`Failed to record quality metrics: ${error}`);
      throw new HttpException(
        'Failed to record quality metrics',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }
}
