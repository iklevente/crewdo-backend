import {
  IsString,
  IsOptional,
  IsEnum,
  IsUUID,
  IsArray,
  IsBoolean,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { WorkspaceType } from '../entities';

export class CreateWorkspaceDto {
  @ApiProperty({ example: 'Acme Corp Workspace' })
  @IsString()
  name: string;

  @ApiPropertyOptional({ example: 'Main workspace for Acme Corporation' })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional({ enum: WorkspaceType, default: WorkspaceType.TEAM })
  @IsOptional()
  @IsEnum(WorkspaceType)
  type?: WorkspaceType;

  @ApiPropertyOptional({ example: false })
  @IsOptional()
  @IsBoolean()
  isPublic?: boolean;

  @ApiPropertyOptional({ example: ['user-id-1', 'user-id-2'] })
  @IsOptional()
  @IsArray()
  @IsUUID('all', { each: true })
  memberIds?: string[];
}

export class UpdateWorkspaceDto {
  @ApiPropertyOptional({ example: 'Updated Workspace Name' })
  @IsOptional()
  @IsString()
  name?: string;

  @ApiPropertyOptional({ example: 'Updated description' })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional({ enum: WorkspaceType })
  @IsOptional()
  @IsEnum(WorkspaceType)
  type?: WorkspaceType;

  @ApiPropertyOptional({ example: true })
  @IsOptional()
  @IsBoolean()
  isPublic?: boolean;
}

export class WorkspaceResponseDto {
  @ApiProperty()
  id: string;

  @ApiProperty()
  name: string;

  @ApiPropertyOptional()
  description?: string;

  @ApiProperty({ enum: WorkspaceType })
  type: WorkspaceType;

  @ApiProperty()
  createdAt: Date;

  @ApiProperty()
  updatedAt: Date;

  @ApiProperty()
  owner: {
    id: string;
    firstName: string;
    lastName: string;
    email: string;
  };

  @ApiPropertyOptional()
  members?: Array<{
    id: string;
    firstName: string;
    lastName: string;
    email: string;
    joinedAt: Date;
  }>;

  @ApiPropertyOptional()
  memberCount?: number;

  @ApiPropertyOptional()
  channelCount?: number;

  @ApiPropertyOptional()
  channels?: Array<{
    id: string;
    name: string;
    type: string;
    visibility: string;
    unreadCount: number;
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
  }>;

  @ApiPropertyOptional()
  projectCount?: number;
}
