import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
  Inject,
} from '@nestjs/common';
import { Repository, DataSource } from 'typeorm';
import {
  Attachment,
  AttachmentType,
  User,
  Task,
  Project,
  Message,
} from '../entities';
import {
  AttachmentResponseDto,
  AttachmentUploadDto,
} from '../dto/attachment.dto';
import * as path from 'path';
import * as fs from 'fs/promises';
import { ConfigService } from '@nestjs/config';
import { createReadStream } from 'fs';

@Injectable()
export class AttachmentService {
  private attachmentRepository: Repository<Attachment>;
  private userRepository: Repository<User>;
  private taskRepository: Repository<Task>;
  private projectRepository: Repository<Project>;
  private messageRepository: Repository<Message>;
  private uploadsPath: string;

  constructor(
    @Inject('DATA_SOURCE')
    private dataSource: DataSource,
    private configService: ConfigService,
  ) {
    this.attachmentRepository = this.dataSource.getRepository(Attachment);
    this.userRepository = this.dataSource.getRepository(User);
    this.taskRepository = this.dataSource.getRepository(Task);
    this.projectRepository = this.dataSource.getRepository(Project);
    this.messageRepository = this.dataSource.getRepository(Message);
    this.uploadsPath = this.configService.get<string>(
      'upload.uploadPath',
      './uploads',
    );
    void this.ensureUploadsDirectory();
  }

  private async ensureUploadsDirectory(): Promise<void> {
    try {
      await fs.mkdir(this.uploadsPath, { recursive: true });
      await fs.mkdir(path.join(this.uploadsPath, 'attachments'), {
        recursive: true,
      });
    } catch (error) {
      console.error('Failed to create uploads directory:', error);
    }
  }

  async uploadFile(
    file: Express.Multer.File,
    uploadDto: AttachmentUploadDto,
    uploaderId: string,
  ): Promise<AttachmentResponseDto> {
    const user = await this.userRepository.findOne({
      where: { id: uploaderId },
    });
    if (!user) {
      throw new NotFoundException('User not found');
    }

    // Validate that at least one parent entity is provided
    if (!uploadDto.taskId && !uploadDto.projectId && !uploadDto.messageId) {
      throw new BadRequestException(
        'Attachment must be associated with a task, project, or message',
      );
    }

    // Validate parent entities exist and user has access
    let task: Task | null = null;
    let project: Project | null = null;
    let message: Message | null = null;

    if (uploadDto.taskId) {
      task = await this.taskRepository.findOne({
        where: { id: uploadDto.taskId },
        relations: ['project', 'project.members', 'assignee'],
      });
      if (!task) {
        throw new NotFoundException('Task not found');
      }
      // Check if user has access to task (is assignee, creator, or project member)
      const hasAccess =
        task.assignee?.id === uploaderId ||
        task.creatorId === uploaderId ||
        task.project?.members?.some((member) => member.id === uploaderId);
      if (!hasAccess) {
        throw new ForbiddenException('Access denied to this task');
      }
    }

    if (uploadDto.projectId) {
      project = await this.projectRepository.findOne({
        where: { id: uploadDto.projectId },
        relations: ['members', 'owner'],
      });
      if (!project) {
        throw new NotFoundException('Project not found');
      }
      // Check if user has access to project
      const hasAccess =
        project.owner.id === uploaderId ||
        project.members?.some((member) => member.id === uploaderId);
      if (!hasAccess) {
        throw new ForbiddenException('Access denied to this project');
      }
    }

    if (uploadDto.messageId) {
      message = await this.messageRepository.findOne({
        where: { id: uploadDto.messageId },
        relations: ['channel', 'channel.members'],
      });
      if (!message) {
        throw new NotFoundException('Message not found');
      }
      // Check if user has access to message channel
      const hasAccess = message.channel.members?.some(
        (member) => member.id === uploaderId,
      );
      if (!hasAccess) {
        throw new ForbiddenException('Access denied to this message');
      }
    }

    // Generate unique filename
    const fileExtension = path.extname(file.originalname);
    const uniqueFilename = `${Date.now()}_${Math.random().toString(36).substr(2, 9)}${fileExtension}`;
    const filePath = path.join(this.uploadsPath, 'attachments', uniqueFilename);

    try {
      // Save file to disk
      await fs.writeFile(filePath, file.buffer);

      // Determine attachment type based on MIME type
      const attachmentType = this.getAttachmentType(file.mimetype);

      // Create attachment record
      const attachment = this.attachmentRepository.create({
        originalName: file.originalname,
        fileName: uniqueFilename,
        filePath: filePath,
        mimeType: file.mimetype,
        fileSize: file.size,
        type: attachmentType,
        uploadedById: user.id,
        taskId: task?.id || undefined,
        projectId: project?.id || undefined,
        messageId: message?.id || undefined,
      });

      const savedAttachment = await this.attachmentRepository.save(attachment);
      return this.formatAttachmentResponse(savedAttachment);
    } catch (error) {
      // Clean up file if database save fails
      try {
        await fs.unlink(filePath);
      } catch (unlinkError) {
        console.error('Failed to cleanup file:', unlinkError);
      }
      throw new BadRequestException(
        `Failed to upload file: ${(error as Error).message}`,
      );
    }
  }

  async findById(id: string, userId: string): Promise<AttachmentResponseDto> {
    const attachment = await this.attachmentRepository.findOne({
      where: { id },
      relations: [
        'uploadedBy',
        'task',
        'task.project',
        'task.project.members',
        'project',
        'project.members',
        'message',
        'message.channel',
        'message.channel.members',
      ],
    });

    if (!attachment) {
      throw new NotFoundException('Attachment not found');
    }

    // Check access permissions
    const hasAccess = this.checkAttachmentAccess(attachment, userId);
    if (!hasAccess) {
      throw new ForbiddenException('Access denied to this attachment');
    }

    return this.formatAttachmentResponse(attachment);
  }

  async findByTask(
    taskId: string,
    userId: string,
  ): Promise<AttachmentResponseDto[]> {
    const task = await this.taskRepository.findOne({
      where: { id: taskId },
      relations: ['project', 'project.members', 'assignee'],
    });

    if (!task) {
      throw new NotFoundException('Task not found');
    }

    // Check access to task
    const hasAccess =
      task.assignee?.id === userId ||
      task.creatorId === userId ||
      task.project?.members?.some((member) => member.id === userId);

    if (!hasAccess) {
      throw new ForbiddenException('Access denied to this task');
    }

    const attachments = await this.attachmentRepository.find({
      where: { taskId },
      relations: ['uploadedBy'],
      order: { uploadedAt: 'DESC' },
    });

    return attachments.map((att) => this.formatAttachmentResponse(att));
  }

  async findByProject(
    projectId: string,
    userId: string,
  ): Promise<AttachmentResponseDto[]> {
    const project = await this.projectRepository.findOne({
      where: { id: projectId },
      relations: ['members', 'owner'],
    });

    if (!project) {
      throw new NotFoundException('Project not found');
    }

    const hasAccess =
      project.owner.id === userId ||
      project.members?.some((member) => member.id === userId);

    if (!hasAccess) {
      throw new ForbiddenException('Access denied to this project');
    }

    const attachments = await this.attachmentRepository.find({
      where: { projectId },
      relations: ['uploadedBy'],
      order: { uploadedAt: 'DESC' },
    });

    return attachments.map((att) => this.formatAttachmentResponse(att));
  }

  async findByMessage(
    messageId: string,
    userId: string,
  ): Promise<AttachmentResponseDto[]> {
    const message = await this.messageRepository.findOne({
      where: { id: messageId },
      relations: ['channel', 'channel.members'],
    });

    if (!message) {
      throw new NotFoundException('Message not found');
    }

    const hasAccess = message.channel.members?.some(
      (member) => member.id === userId,
    );

    if (!hasAccess) {
      throw new ForbiddenException('Access denied to this message');
    }

    const attachments = await this.attachmentRepository.find({
      where: { messageId },
      relations: ['uploadedBy'],
      order: { uploadedAt: 'DESC' },
    });

    return attachments.map((att) => this.formatAttachmentResponse(att));
  }

  async deleteAttachment(id: string, userId: string): Promise<void> {
    const attachment = await this.attachmentRepository.findOne({
      where: { id },
      relations: [
        'uploadedBy',
        'task',
        'task.project',
        'task.project.members',
        'project',
        'project.members',
        'message',
        'message.channel',
        'message.channel.members',
      ],
    });

    if (!attachment) {
      throw new NotFoundException('Attachment not found');
    }

    // Only uploader, task/project owners, or admins can delete
    const canDelete = this.checkAttachmentDeleteAccess(attachment, userId);
    if (!canDelete) {
      throw new ForbiddenException('You cannot delete this attachment');
    }

    try {
      // Delete file from disk
      await fs.unlink(attachment.filePath);
    } catch (error) {
      console.error('Failed to delete file from disk:', error);
    }

    // Delete database record
    await this.attachmentRepository.remove(attachment);
  }

  async getFileStream(
    id: string,
    userId: string,
  ): Promise<{
    stream: import('fs').ReadStream;
    filename: string;
    mimeType: string;
  }> {
    const attachment = await this.attachmentRepository.findOne({
      where: { id },
      relations: [
        'uploadedBy',
        'task',
        'task.project',
        'task.project.members',
        'project',
        'project.members',
        'message',
        'message.channel',
        'message.channel.members',
      ],
    });

    if (!attachment) {
      throw new NotFoundException('Attachment not found');
    }

    const hasAccess = this.checkAttachmentAccess(attachment, userId);
    if (!hasAccess) {
      throw new ForbiddenException('Access denied to this attachment');
    }

    try {
      // Check if file exists
      await fs.access(attachment.filePath);

      const stream = createReadStream(attachment.filePath);
      return {
        stream,
        filename: attachment.originalName,
        mimeType: attachment.mimeType,
      };
    } catch {
      throw new NotFoundException('File not found on disk');
    }
  }

  private checkAttachmentAccess(
    attachment: Attachment,
    userId: string,
  ): boolean {
    // Uploader always has access
    if (attachment.uploadedBy.id === userId) {
      return true;
    }

    // Check task access
    if (attachment.task) {
      return (
        attachment.task.assignee?.id === userId ||
        attachment.task.creatorId === userId ||
        attachment.task.project?.members?.some((member) => member.id === userId)
      );
    }

    // Check project access
    if (attachment.project) {
      return (
        attachment.project.owner.id === userId ||
        attachment.project.members?.some((member) => member.id === userId)
      );
    }

    // Check message access
    if (attachment.message) {
      return attachment.message.channel.members?.some(
        (member) => member.id === userId,
      );
    }

    return false;
  }

  private checkAttachmentDeleteAccess(
    attachment: Attachment,
    userId: string,
  ): boolean {
    // Uploader can always delete
    if (attachment.uploadedBy.id === userId) {
      return true;
    }

    // Task/Project owners can delete
    if (attachment.task?.project?.owner?.id === userId) {
      return true;
    }

    if (attachment.project?.owner?.id === userId) {
      return true;
    }

    // Message author can delete (need to check this)
    if (attachment.message?.author?.id === userId) {
      return true;
    }

    return false;
  }

  private getAttachmentType(mimeType: string): AttachmentType {
    if (mimeType.startsWith('image/')) {
      return AttachmentType.IMAGE;
    }
    if (mimeType.startsWith('video/')) {
      return AttachmentType.VIDEO;
    }
    if (mimeType.startsWith('audio/')) {
      return AttachmentType.AUDIO;
    }
    if (
      mimeType.includes('pdf') ||
      mimeType.includes('document') ||
      mimeType.includes('text') ||
      mimeType.includes('spreadsheet') ||
      mimeType.includes('presentation')
    ) {
      return AttachmentType.DOCUMENT;
    }
    return AttachmentType.OTHER;
  }

  private formatAttachmentResponse(
    attachment: Attachment,
  ): AttachmentResponseDto {
    const baseUrl = this.configService.get<string>(
      'baseUrl',
      'http://localhost:3000',
    );
    return {
      id: attachment.id,
      originalName: attachment.originalName,
      fileName: attachment.fileName,
      filePath: attachment.filePath,
      mimeType: attachment.mimeType,
      fileSize: attachment.fileSize,
      type: attachment.type,
      uploadedAt: attachment.uploadedAt,
      uploadedBy: {
        id: attachment.uploadedBy.id,
        firstName: attachment.uploadedBy.firstName,
        lastName: attachment.uploadedBy.lastName,
        email: attachment.uploadedBy.email,
      },
      taskId: attachment.taskId,
      projectId: attachment.projectId,
      messageId: attachment.messageId,
      url: `${baseUrl}/api/attachments/${attachment.id}/download`,
    };
  }
}
