import { IsOptional, IsUUID } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class MarkAsReadDto {
  @ApiPropertyOptional({
    description:
      'Message ID to mark as read up to. If not provided, marks all messages in channel as read',
    example: 'message-uuid-here',
  })
  @IsOptional()
  @IsUUID()
  upToMessageId?: string;
}

export class ReadReceiptResponseDto {
  @ApiPropertyOptional({ description: 'Success message' })
  message: string;

  @ApiPropertyOptional({ description: 'Number of messages marked as read' })
  markedAsRead: number;
}
