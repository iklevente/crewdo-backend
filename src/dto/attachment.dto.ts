import { ApiProperty } from '@nestjs/swagger';
import { IsOptional, IsUUID } from 'class-validator';
import { AttachmentType } from '../entities/attachment.entity';

export class AttachmentResponseDto {
  @ApiProperty()
  id: string;

  @ApiProperty()
  originalName: string;

  @ApiProperty()
  fileName: string;

  @ApiProperty()
  filePath: string;

  @ApiProperty()
  mimeType: string;

  @ApiProperty()
  fileSize: number;

  @ApiProperty({ enum: AttachmentType })
  type: AttachmentType;

  @ApiProperty()
  uploadedAt: Date;

  @ApiProperty({
    description: 'User who uploaded the file',
  })
  uploadedBy: {
    id: string;
    firstName: string;
    lastName: string;
    email: string;
  };

  @ApiProperty({ required: false })
  taskId?: string;

  @ApiProperty({ required: false })
  projectId?: string;

  @ApiProperty({ required: false })
  messageId?: string;

  @ApiProperty({
    description: 'Public URL to access the file',
    required: false,
  })
  url?: string;
}

export class AttachmentUploadDto {
  @ApiProperty({
    type: 'string',
    format: 'binary',
    description: 'File to upload',
  })
  file: any;

  @ApiProperty({
    description: 'ID of the task this attachment belongs to',
    required: false,
  })
  @IsOptional()
  @IsUUID()
  taskId?: string;

  @ApiProperty({
    description: 'ID of the project this attachment belongs to',
    required: false,
  })
  @IsOptional()
  @IsUUID()
  projectId?: string;

  @ApiProperty({
    description: 'ID of the message this attachment belongs to',
    required: false,
  })
  @IsOptional()
  @IsUUID()
  messageId?: string;
}
