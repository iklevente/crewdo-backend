import {
  IsString,
  IsOptional,
  IsNumber,
  IsUUID,
  Min,
  Max,
  IsObject,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateMediaRoomDto {
  @ApiProperty({
    example: 'Meeting Room 1',
    description: 'Name of the media room',
  })
  @IsString()
  name: string;

  @ApiPropertyOptional({
    example: 10,
    description: 'Maximum number of participants allowed',
    minimum: 1,
    maximum: 100,
  })
  @IsOptional()
  @IsNumber()
  @Min(1)
  @Max(100)
  maxParticipants?: number;
}

export class JoinRoomDto {
  @ApiProperty({
    example: '6CFA423E-F36B-1410-83B4-001C5639B45F',
    description: 'ID of the user joining the room',
  })
  @IsUUID()
  userId: string;

  @ApiPropertyOptional({
    description: 'Media constraints for the user',
    example: { audio: true, video: true, screen: false },
  })
  @IsOptional()
  @IsObject()
  mediaConstraints?: {
    audio: boolean;
    video: boolean;
    screen: boolean;
  };
}

export class LeaveRoomDto {
  @ApiProperty({
    example: '6CFA423E-F36B-1410-83B4-001C5639B45F',
    description: 'ID of the user leaving the room',
  })
  @IsUUID()
  userId: string;
}

export class ScreenShareDto {
  @ApiProperty({
    example: '6CFA423E-F36B-1410-83B4-001C5639B45F',
    description: 'ID of the user starting/stopping screen share',
  })
  @IsUUID()
  userId: string;

  @ApiPropertyOptional({
    description: 'Screen share constraints',
    example: { video: true, audio: true },
  })
  @IsOptional()
  @IsObject()
  constraints?: any;
}

export class QualityMetricsDto {
  @ApiProperty({
    example: '6CFA423E-F36B-1410-83B4-001C5639B45F',
    description: 'ID of the user reporting metrics',
  })
  @IsUUID()
  userId: string;

  @ApiProperty({
    description: 'Quality metrics data',
    example: {
      bitrate: 1500,
      packetLoss: 0.02,
      jitter: 5,
      rtt: 45,
    },
  })
  @IsObject()
  metrics: {
    bitrate: number;
    packetLoss: number;
    jitter: number;
    rtt: number;
  };
}

// Response DTOs
export class MediaRoomResponseDto {
  @ApiProperty({ example: 'room_123456789_abc' })
  id: string;

  @ApiProperty({ example: [] })
  participants: string[];

  @ApiProperty({ example: true })
  isActive: boolean;

  @ApiProperty({ example: '2025-10-12T16:38:27.969Z' })
  createdAt: Date;
}

export class QualityMetricsResponseDto {
  @ApiProperty({ example: 1500 })
  bitrate: number;

  @ApiProperty({ example: 0.02 })
  packetLoss: number;

  @ApiProperty({ example: 5 })
  jitter: number;

  @ApiProperty({ example: 45 })
  rtt: number;

  @ApiProperty({ example: '2025-10-12T16:38:27.969Z' })
  timestamp: Date;
}
