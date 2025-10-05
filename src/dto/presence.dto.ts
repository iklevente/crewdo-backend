import { IsString, IsOptional, IsEnum, IsBoolean } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export enum PresenceStatus {
  ONLINE = 'online',
  AWAY = 'away',
  DO_NOT_DISTURB = 'do_not_disturb',
  OFFLINE = 'offline',
}

export class UpdatePresenceDto {
  @ApiProperty({ enum: PresenceStatus, example: PresenceStatus.ONLINE })
  @IsEnum(PresenceStatus)
  status: PresenceStatus;

  @ApiPropertyOptional({ example: 'In a meeting' })
  @IsOptional()
  @IsString()
  customStatus?: string;

  @ApiPropertyOptional({ example: '📅' })
  @IsOptional()
  @IsString()
  customStatusEmoji?: string;

  @ApiPropertyOptional({ example: true })
  @IsOptional()
  @IsBoolean()
  isInCall?: boolean;

  @ApiPropertyOptional({ example: 'call-uuid-here' })
  @IsOptional()
  @IsString()
  currentCallId?: string;
}

export class PresenceResponseDto {
  @ApiProperty()
  id: string;

  @ApiProperty({ enum: PresenceStatus })
  status: PresenceStatus;

  @ApiPropertyOptional()
  customStatus?: string;

  @ApiPropertyOptional()
  customStatusEmoji?: string;

  @ApiProperty()
  isInCall: boolean;

  @ApiPropertyOptional()
  currentCallId?: string;

  @ApiProperty()
  lastSeenAt: Date;

  @ApiProperty()
  updatedAt: Date;

  @ApiProperty()
  user: {
    id: string;
    firstName: string;
    lastName: string;
    email: string;
    avatar?: string;
  };
}

export class UserActivityDto {
  @ApiProperty()
  userId: string;

  @ApiProperty()
  activity: 'typing' | 'recording' | 'uploading' | 'idle';

  @ApiPropertyOptional()
  channelId?: string;

  @ApiPropertyOptional()
  metadata?: {
    fileName?: string;
    duration?: number;
    [key: string]: any;
  };
}
