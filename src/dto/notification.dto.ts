import { ApiProperty } from '@nestjs/swagger';
import {
  IsOptional,
  IsString,
  IsEnum,
  IsUUID,
  IsBoolean,
} from 'class-validator';
import { NotificationType } from '../entities/notification.entity';

export class CreateNotificationDto {
  @ApiProperty({
    description: 'Title of the notification',
    example: 'Task Assigned',
  })
  @IsString()
  title: string;

  @ApiProperty({
    description: 'Detailed message of the notification',
    example:
      'You have been assigned a new task: Complete project documentation',
  })
  @IsString()
  message: string;

  @ApiProperty({
    description: 'Type of notification',
    enum: NotificationType,
    example: NotificationType.TASK_ASSIGNED,
  })
  @IsEnum(NotificationType)
  type: NotificationType;

  @ApiProperty({
    description: 'ID of the user to receive the notification',
  })
  @IsUUID()
  userId: string;

  @ApiProperty({
    description: 'ID of the related entity (task, project, etc.)',
    required: false,
  })
  @IsOptional()
  @IsUUID()
  relatedEntityId?: string;

  @ApiProperty({
    description: 'Type of the related entity',
    example: 'task',
    required: false,
  })
  @IsOptional()
  @IsString()
  relatedEntityType?: string;
}

export class UpdateNotificationDto {
  @ApiProperty({
    description: 'Mark notification as read/unread',
    required: false,
  })
  @IsOptional()
  @IsBoolean()
  isRead?: boolean;
}

export class NotificationResponseDto {
  @ApiProperty()
  id: string;

  @ApiProperty()
  title: string;

  @ApiProperty()
  message: string;

  @ApiProperty({ enum: NotificationType })
  type: NotificationType;

  @ApiProperty()
  isRead: boolean;

  @ApiProperty({ required: false })
  relatedEntityId?: string;

  @ApiProperty({ required: false })
  relatedEntityType?: string;

  @ApiProperty()
  createdAt: Date;

  @ApiProperty({
    description: 'User who owns this notification',
  })
  user: {
    id: string;
    firstName: string;
    lastName: string;
    email: string;
  };
}

export class NotificationQueryDto {
  @ApiProperty({
    description: 'Filter by notification type',
    enum: NotificationType,
    required: false,
  })
  @IsOptional()
  @IsEnum(NotificationType)
  type?: NotificationType;

  @ApiProperty({
    description: 'Filter by read status',
    required: false,
  })
  @IsOptional()
  @IsBoolean()
  isRead?: boolean;

  @ApiProperty({
    description: 'Limit number of results',
    required: false,
    default: 50,
  })
  @IsOptional()
  limit?: number;

  @ApiProperty({
    description: 'Offset for pagination',
    required: false,
    default: 0,
  })
  @IsOptional()
  offset?: number;
}
