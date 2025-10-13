import {
  IsString,
  IsOptional,
  IsUUID,
  IsArray,
  IsBoolean,
  IsEnum,
  IsDateString,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export enum CallType {
  VOICE = 'voice',
  VIDEO = 'video',
  SCREEN_SHARE = 'screen_share',
}

export enum CallStatus {
  SCHEDULED = 'scheduled',
  ACTIVE = 'active',
  ENDED = 'ended',
  CANCELLED = 'cancelled',
}

export class StartCallDto {
  @ApiProperty({ example: 'channel-uuid-here' })
  @IsUUID()
  channelId: string;

  @ApiProperty({ enum: CallType, example: CallType.VOICE })
  @IsEnum(CallType)
  type: CallType;

  @ApiPropertyOptional({ example: 'Daily standup call' })
  @IsOptional()
  @IsString()
  title?: string;

  @ApiPropertyOptional({ example: true })
  @IsOptional()
  @IsBoolean()
  isRecorded?: boolean;

  @ApiPropertyOptional({ example: ['user-id-1', 'user-id-2'] })
  @IsOptional()
  @IsArray()
  @IsUUID('all', { each: true })
  invitedUserIds?: string[];
}

export class ScheduleCallDto {
  @ApiProperty({ example: 'channel-uuid-here' })
  @IsUUID()
  channelId: string;

  @ApiProperty({ enum: CallType, example: CallType.VIDEO })
  @IsEnum(CallType)
  type: CallType;

  @ApiProperty({ example: 'Sprint Planning Meeting' })
  @IsString()
  title: string;

  @ApiPropertyOptional({ example: "Let's discuss the upcoming sprint goals" })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiProperty({ example: '2024-02-15T10:00:00Z' })
  @IsDateString()
  scheduledStartTime: string;

  @ApiPropertyOptional({ example: '2024-02-15T11:00:00Z' })
  @IsOptional()
  @IsDateString()
  scheduledEndTime?: string;

  @ApiPropertyOptional({ example: ['user-id-1', 'user-id-2'] })
  @IsOptional()
  @IsArray()
  @IsUUID('all', { each: true })
  invitedUserIds?: string[];

  @ApiPropertyOptional({ example: true })
  @IsOptional()
  @IsBoolean()
  isRecorded?: boolean;
}

export class JoinCallDto {
  @ApiProperty({ example: 'call-uuid-here' })
  @IsUUID()
  callId: string;

  @ApiPropertyOptional({ example: true })
  @IsOptional()
  @IsBoolean()
  withVideo?: boolean;

  @ApiPropertyOptional({ example: true })
  @IsOptional()
  @IsBoolean()
  withAudio?: boolean;
}

export class UpdateCallParticipantDto {
  @ApiPropertyOptional({ example: false })
  @IsOptional()
  @IsBoolean()
  isMuted?: boolean;

  @ApiPropertyOptional({ example: false })
  @IsOptional()
  @IsBoolean()
  isVideoEnabled?: boolean;

  @ApiPropertyOptional({ example: true })
  @IsOptional()
  @IsBoolean()
  isScreenSharing?: boolean;

  @ApiPropertyOptional({ example: false })
  @IsOptional()
  @IsBoolean()
  isHandRaised?: boolean;
}

export class CallResponseDto {
  @ApiProperty()
  id: string;

  @ApiPropertyOptional()
  title?: string;

  @ApiPropertyOptional()
  description?: string;

  @ApiProperty({ enum: CallType })
  type: CallType;

  @ApiProperty({ enum: CallStatus })
  status: CallStatus;

  @ApiProperty()
  isRecorded: boolean;

  @ApiProperty()
  createdAt: Date;

  @ApiProperty()
  updatedAt: Date;

  @ApiPropertyOptional()
  startedAt?: Date;

  @ApiPropertyOptional()
  endedAt?: Date;

  @ApiPropertyOptional()
  scheduledStartTime?: Date;

  @ApiPropertyOptional()
  scheduledEndTime?: Date;

  @ApiProperty()
  initiator: {
    id: string;
    firstName: string;
    lastName: string;
    avatar?: string;
  };

  @ApiProperty()
  channel: {
    id: string;
    name: string;
    type: string;
  };

  @ApiProperty()
  participants: Array<{
    id: string;
    user: {
      id: string;
      firstName: string;
      lastName: string;
      avatar?: string;
    };
    joinedAt: Date;
    leftAt?: Date;
    isMuted: boolean;
    isVideoEnabled: boolean;
    isScreenSharing: boolean;
    isHandRaised: boolean;
    connectionQuality: string;
  }>;

  @ApiPropertyOptional()
  recordingUrl?: string;

  @ApiPropertyOptional()
  duration?: number; // in seconds

  @ApiPropertyOptional()
  maxParticipants?: number;
}

export class CallInvitationResponseDto {
  @ApiProperty()
  id: string;

  @ApiProperty()
  call: CallResponseDto;

  @ApiProperty()
  invitee: {
    id: string;
    firstName: string;
    lastName: string;
    email: string;
  };

  @ApiProperty()
  inviter: {
    id: string;
    firstName: string;
    lastName: string;
  };

  @ApiProperty()
  createdAt: Date;

  @ApiProperty()
  respondedAt?: Date;

  @ApiProperty()
  response?: 'accepted' | 'declined';
}

export class WebRTCSignalingDto {
  @ApiProperty({ example: 'call-uuid-here' })
  @IsUUID()
  callId: string;

  @ApiProperty({ example: 'offer' })
  @IsString()
  type: 'offer' | 'answer' | 'ice-candidate';

  @ApiProperty()
  @IsOptional()
  data?: any; // WebRTC offer/answer/ice candidate data
}
