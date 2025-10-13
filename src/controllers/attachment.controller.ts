import {
  Controller,
  Get,
  Post,
  Delete,
  Param,
  Query,
  UseGuards,
  Request,
  UseInterceptors,
  UploadedFile,
  BadRequestException,
  StreamableFile,
  Response,
  ParseUUIDPipe,
} from '@nestjs/common';
import {
  ApiTags,
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiConsumes,
  ApiParam,
} from '@nestjs/swagger';
import { FileInterceptor } from '@nestjs/platform-express';
import { AttachmentService } from '../services/attachment.service';
import {
  AttachmentResponseDto,
  AttachmentUploadDto,
} from '../dto/attachment.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import type { Response as ExpressResponse } from 'express';

interface AuthenticatedRequest {
  user: {
    id: string;
    email: string;
    role: string;
  };
}

@ApiTags('attachments')
@Controller('attachments')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class AttachmentController {
  constructor(private readonly attachmentService: AttachmentService) {}

  @Post('upload')
  @ApiOperation({ summary: 'Upload an attachment' })
  @ApiConsumes('multipart/form-data')
  @ApiResponse({
    status: 201,
    description: 'File uploaded successfully',
    type: AttachmentResponseDto,
  })
  @UseInterceptors(FileInterceptor('file'))
  async uploadFile(
    @UploadedFile() file: Express.Multer.File,
    @Query() uploadDto: AttachmentUploadDto,
    @Request() req: AuthenticatedRequest,
  ): Promise<AttachmentResponseDto> {
    if (!file) {
      throw new BadRequestException('No file provided');
    }

    // Validate file size (e.g., 10MB limit)
    const maxSize = 10 * 1024 * 1024; // 10MB
    if (file.size > maxSize) {
      throw new BadRequestException('File size exceeds 10MB limit');
    }

    return this.attachmentService.uploadFile(file, uploadDto, req.user.id);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get attachment details by ID' })
  @ApiParam({ name: 'id', description: 'Attachment ID (UUID)' })
  @ApiResponse({
    status: 200,
    description: 'Attachment details',
    type: AttachmentResponseDto,
  })
  @ApiResponse({
    status: 403,
    description: 'Forbidden - No access to this attachment',
  })
  async findById(
    @Param('id', ParseUUIDPipe) id: string,
    @Request() req: AuthenticatedRequest,
  ): Promise<AttachmentResponseDto> {
    // Service validates user has access to the attachment
    return this.attachmentService.findById(id, req.user.id);
  }

  @Get(':id/download')
  @ApiOperation({ summary: 'Download attachment file' })
  @ApiParam({ name: 'id', description: 'Attachment ID (UUID)' })
  @ApiResponse({ status: 200, description: 'File stream' })
  @ApiResponse({
    status: 403,
    description: 'Forbidden - No access to this attachment',
  })
  async downloadFile(
    @Param('id', ParseUUIDPipe) id: string,
    @Request() req: AuthenticatedRequest,
    @Response({ passthrough: true }) res: ExpressResponse,
  ): Promise<StreamableFile> {
    // Service validates user has access to the attachment before providing stream
    const { stream, filename, mimeType } =
      await this.attachmentService.getFileStream(id, req.user.id);

    res.setHeader('Content-Type', mimeType);
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);

    return new StreamableFile(stream);
  }

  @Get('task/:taskId')
  @ApiOperation({ summary: 'Get attachments for a task' })
  @ApiParam({ name: 'taskId', description: 'Task ID (UUID)' })
  @ApiResponse({
    status: 200,
    description: 'List of task attachments',
    type: [AttachmentResponseDto],
  })
  @ApiResponse({
    status: 403,
    description: 'Forbidden - No access to this task',
  })
  async findByTask(
    @Param('taskId', ParseUUIDPipe) taskId: string,
    @Request() req: AuthenticatedRequest,
  ): Promise<AttachmentResponseDto[]> {
    // Service validates user has access to the task
    return this.attachmentService.findByTask(taskId, req.user.id);
  }

  @Get('project/:projectId')
  @ApiOperation({ summary: 'Get attachments for a project' })
  @ApiParam({ name: 'projectId', description: 'Project ID (UUID)' })
  @ApiResponse({
    status: 200,
    description: 'List of project attachments',
    type: [AttachmentResponseDto],
  })
  @ApiResponse({
    status: 403,
    description: 'Forbidden - No access to this project',
  })
  async findByProject(
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @Request() req: AuthenticatedRequest,
  ): Promise<AttachmentResponseDto[]> {
    // Service validates user has access to the project
    return this.attachmentService.findByProject(projectId, req.user.id);
  }

  @Get('message/:messageId')
  @ApiOperation({ summary: 'Get attachments for a message' })
  @ApiParam({ name: 'messageId', description: 'Message ID (UUID)' })
  @ApiResponse({
    status: 200,
    description: 'List of message attachments',
    type: [AttachmentResponseDto],
  })
  @ApiResponse({
    status: 403,
    description: 'Forbidden - No access to this message',
  })
  async findByMessage(
    @Param('messageId', ParseUUIDPipe) messageId: string,
    @Request() req: AuthenticatedRequest,
  ): Promise<AttachmentResponseDto[]> {
    // Service validates user has access to the message
    return this.attachmentService.findByMessage(messageId, req.user.id);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete an attachment' })
  @ApiParam({ name: 'id', description: 'Attachment ID (UUID)' })
  @ApiResponse({ status: 200, description: 'Attachment deleted successfully' })
  @ApiResponse({
    status: 403,
    description:
      'Forbidden - Can only delete own attachments or admin access required',
  })
  async deleteAttachment(
    @Param('id', ParseUUIDPipe) id: string,
    @Request() req: AuthenticatedRequest,
  ): Promise<{ message: string }> {
    // Service validates user has permission to delete this attachment
    await this.attachmentService.deleteAttachment(id, req.user.id);
    return { message: 'Attachment deleted successfully' };
  }
}
