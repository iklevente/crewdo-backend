import { ApiProperty } from '@nestjs/swagger';
import { IsOptional, IsString, IsEnum, IsUUID } from 'class-validator';
import { AttachmentType } from '../entities/attachment.entity';

export class CreateAttachmentDto {
  @ApiProperty({
    description: 'Original filename of the uploaded file',
    example: 'document.pdf',
  })
  @IsString()
  originalName: string;

  @ApiProperty({
    description: 'MIME type of the file',
    example: 'application/pdf',
  })
  @IsString()
  mimeType: string;

  @ApiProperty({
    description: 'Size of the file in bytes',
    example: 1024000,
  })
  fileSize: number;

  @ApiProperty({
    description: 'Type of attachment',
    enum: AttachmentType,
    example: AttachmentType.DOCUMENT,
  })
  @IsEnum(AttachmentType)
  type: AttachmentType;

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
