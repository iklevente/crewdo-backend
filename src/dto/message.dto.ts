import {
  IsString,
  IsOptional,
  IsUUID,
  IsArray,
  IsBoolean,
  IsObject,
} from 'class-validator';
import { Transform } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateMessageDto {
  @ApiProperty({ example: 'Hello everyone! 👋' })
  @IsString()
  content: string;

  @ApiProperty({ example: 'channel-uuid-here' })
  @IsUUID()
  channelId: string;

  @ApiPropertyOptional({ example: 'parent-message-uuid' })
  @IsOptional()
  @IsUUID()
  parentMessageId?: string;

  @ApiPropertyOptional({ example: ['file-uuid-1', 'file-uuid-2'] })
  @IsOptional()
  @IsArray()
  @IsUUID('all', { each: true })
  attachmentIds?: string[];

  @ApiPropertyOptional({ description: 'Structured payload for embeds' })
  @IsOptional()
  @IsObject()
  embedData?: Record<string, unknown>;

  @ApiPropertyOptional({ example: false })
  @IsOptional()
  @IsBoolean()
  isSystemMessage?: boolean;
}

export class UpdateMessageDto {
  @ApiPropertyOptional({ example: 'Updated message content' })
  @IsOptional()
  @IsString()
  content?: string;
}

export class MessageReactionDto {
  @ApiProperty({ example: '👍' })
  @IsString()
  emoji: string;

  @ApiProperty({ example: 'message-uuid-here' })
  @IsUUID()
  messageId: string;
}

export class MessageResponseDto {
  @ApiProperty()
  id: string;

  @ApiProperty()
  content: string;

  @ApiProperty()
  isEdited: boolean;

  @ApiProperty()
  isDeleted: boolean;

  @ApiProperty()
  isSystemMessage: boolean;

  @ApiProperty()
  createdAt: Date;

  @ApiProperty()
  updatedAt: Date;

  @ApiPropertyOptional()
  editedAt?: Date;

  @ApiProperty()
  author: {
    id: string;
    firstName: string;
    lastName: string;
    email: string;
    avatar?: string;
  };

  @ApiProperty()
  channel: {
    id: string;
    name: string;
    type: string;
  };

  @ApiPropertyOptional()
  parentMessage?: {
    id: string;
    content: string;
    author: {
      id: string;
      firstName: string;
      lastName: string;
    };
  };

  @ApiProperty()
  attachments: Array<{
    id: string;
    filename: string;
    url: string;
    size: number;
    mimeType: string;
  }>;

  @ApiProperty()
  reactions: Array<{
    id: string;
    emoji: string;
    count: number;
    users: Array<{
      id: string;
      firstName: string;
      lastName: string;
    }>;
    userReacted: boolean; // Whether current user reacted with this emoji
  }>;
}

export class MessageSearchDto {
  @ApiPropertyOptional({ example: 'search query' })
  @IsOptional()
  @IsString()
  query?: string;

  @ApiPropertyOptional({ example: 'channel-uuid-here' })
  @IsOptional()
  @IsUUID()
  channelId?: string;

  @ApiPropertyOptional({ example: 'author-uuid-here' })
  @IsOptional()
  @IsUUID()
  authorId?: string;

  @ApiPropertyOptional({ example: true })
  @IsOptional()
  @Transform(({ value }): boolean | string => {
    if (value === 'true') return true;
    if (value === 'false') return false;
    return value as string;
  })
  @IsBoolean()
  hasAttachments?: boolean;

  @ApiPropertyOptional({ example: true })
  @IsOptional()
  @Transform(({ value }): boolean | string => {
    if (value === 'true') return true;
    if (value === 'false') return false;
    return value as string;
  })
  @IsBoolean()
  isPinned?: boolean;

  @ApiPropertyOptional({ example: '2024-01-01' })
  @IsOptional()
  @IsString()
  fromDate?: string;

  @ApiPropertyOptional({ example: '2024-12-31' })
  @IsOptional()
  @IsString()
  toDate?: string;
}

export class MessageHistoryDto {
  @ApiPropertyOptional({ example: 'cursor-token-here' })
  @IsOptional()
  @IsString()
  cursor?: string;

  @ApiPropertyOptional({ example: 50 })
  @IsOptional()
  limit?: number;

  @ApiPropertyOptional({ example: 'desc' })
  @IsOptional()
  @IsString()
  order?: 'asc' | 'desc';
}
