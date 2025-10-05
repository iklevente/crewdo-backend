import {
  IsString,
  IsOptional,
  IsEnum,
  IsUUID,
  IsArray,
  IsBoolean,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ChannelType, ChannelVisibility } from '../entities';

export class CreateChannelDto {
  @ApiProperty({ example: 'general' })
  @IsString()
  name: string;

  @ApiPropertyOptional({ example: 'General discussion channel' })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional({ enum: ChannelType, default: ChannelType.TEXT })
  @IsOptional()
  @IsEnum(ChannelType)
  type?: ChannelType;

  @ApiPropertyOptional({
    enum: ChannelVisibility,
    default: ChannelVisibility.PUBLIC,
  })
  @IsOptional()
  @IsEnum(ChannelVisibility)
  visibility?: ChannelVisibility;

  @ApiPropertyOptional({ example: 'Weekly standup discussions' })
  @IsOptional()
  @IsString()
  topic?: string;

  @ApiProperty({ example: 'workspace-uuid-here' })
  @IsUUID()
  workspaceId: string;

  @ApiPropertyOptional({ example: 'project-uuid-here' })
  @IsOptional()
  @IsUUID()
  projectId?: string;

  @ApiPropertyOptional({ example: ['user-id-1', 'user-id-2'] })
  @IsOptional()
  @IsArray()
  @IsUUID('4', { each: true })
  memberIds?: string[];
}

export class CreateDirectMessageDto {
  @ApiProperty({ example: ['user-id-1', 'user-id-2'] })
  @IsArray()
  @IsUUID('4', { each: true })
  userIds: string[];

  @ApiPropertyOptional({ example: 'Project Alpha Discussion' })
  @IsOptional()
  @IsString()
  name?: string; // For group DMs
}

export class UpdateChannelDto {
  @ApiPropertyOptional({ example: 'updated-channel-name' })
  @IsOptional()
  @IsString()
  name?: string;

  @ApiPropertyOptional({ example: 'Updated description' })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional({ example: 'New topic for discussion' })
  @IsOptional()
  @IsString()
  topic?: string;

  @ApiPropertyOptional({ enum: ChannelVisibility })
  @IsOptional()
  @IsEnum(ChannelVisibility)
  visibility?: ChannelVisibility;

  @ApiPropertyOptional({ example: false })
  @IsOptional()
  @IsBoolean()
  isArchived?: boolean;
}

export class ChannelResponseDto {
  @ApiProperty()
  id: string;

  @ApiProperty()
  name: string;

  @ApiPropertyOptional()
  description?: string;

  @ApiProperty({ enum: ChannelType })
  type: ChannelType;

  @ApiProperty({ enum: ChannelVisibility })
  visibility: ChannelVisibility;

  @ApiPropertyOptional()
  topic?: string;

  @ApiProperty()
  isArchived: boolean;

  @ApiProperty()
  isThread: boolean;

  @ApiProperty()
  createdAt: Date;

  @ApiProperty()
  updatedAt: Date;

  @ApiPropertyOptional()
  creator?: {
    id: string;
    firstName: string;
    lastName: string;
    email: string;
  };

  @ApiProperty()
  members: Array<{
    id: string;
    firstName: string;
    lastName: string;
    email: string;
    presence?: {
      status: string;
      customStatus?: string;
    };
  }>;

  @ApiPropertyOptional()
  workspace?: {
    id: string;
    name: string;
  };

  @ApiPropertyOptional()
  project?: {
    id: string;
    name: string;
  };

  @ApiPropertyOptional()
  messageCount?: number;

  @ApiPropertyOptional()
  unreadCount?: number;

  @ApiPropertyOptional()
  lastMessage?: {
    id: string;
    content: string;
    author: {
      id: string;
      firstName: string;
      lastName: string;
    };
    createdAt: Date;
  };
}
