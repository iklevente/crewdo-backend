import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  UseGuards,
  Query,
  ParseUUIDPipe,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiQuery,
} from '@nestjs/swagger';
import { CommentsService } from './comments.service';
import { ChatGateway } from '../realtime/chat.gateway';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import {
  CreateCommentDto,
  UpdateCommentDto,
  CommentResponseDto,
} from '../dto/comment.dto';
import { User } from '../entities';
import { Comment as CommentEntity } from '../entities/comment.entity';

@ApiTags('Comments')
@Controller('comments')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class CommentsController {
  constructor(
    private readonly commentsService: CommentsService,
    private readonly chatGateway: ChatGateway,
  ) {}

  private getCommentRecipients(comment: CommentEntity): string[] {
    const memberIds =
      comment.task?.project?.members?.map((m) => m.id).filter(Boolean) || [];
    const ownerId = comment.task?.project?.ownerId as string | undefined;
    return ownerId ? [...memberIds, ownerId] : memberIds;
  }

  @ApiOperation({ summary: 'Create a new comment' })
  @ApiResponse({
    status: 201,
    description: 'Comment created successfully',
    type: CommentResponseDto,
  })
  @ApiResponse({ status: 404, description: 'Task not found' })
  @ApiResponse({ status: 403, description: 'Access denied to this task' })
  @Post()
  async create(
    @Body() createCommentDto: CreateCommentDto,
    @CurrentUser() user: User,
  ) {
    const comment = await this.commentsService.create(
      createCommentDto,
      user.id,
    );

    // Broadcast to project members and owner
    this.chatGateway.publishProjectUpdate(
      'comment_created',
      comment,
      this.getCommentRecipients(comment),
    );

    return comment;
  }

  @ApiOperation({ summary: 'Get comments for a task' })
  @ApiQuery({ name: 'taskId', description: 'Task ID to get comments for' })
  @ApiResponse({
    status: 200,
    description: 'Comments retrieved successfully',
    type: [CommentResponseDto],
  })
  @ApiResponse({ status: 404, description: 'Task not found' })
  @ApiResponse({ status: 403, description: 'Access denied to this task' })
  @Get()
  async findByTaskId(
    @Query('taskId', ParseUUIDPipe) taskId: string,
    @CurrentUser() user: User,
  ) {
    return await this.commentsService.findByTaskId(taskId, user.id, user.role);
  }

  @ApiOperation({ summary: 'Get comment by ID' })
  @ApiResponse({
    status: 200,
    description: 'Comment retrieved successfully',
    type: CommentResponseDto,
  })
  @ApiResponse({ status: 404, description: 'Comment not found' })
  @ApiResponse({ status: 403, description: 'Access denied to this comment' })
  @Get(':id')
  async findOne(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: User,
  ) {
    return await this.commentsService.findOne(id, user.id, user.role);
  }

  @ApiOperation({ summary: 'Update comment (author only)' })
  @ApiResponse({
    status: 200,
    description: 'Comment updated successfully',
    type: CommentResponseDto,
  })
  @ApiResponse({ status: 404, description: 'Comment not found' })
  @ApiResponse({
    status: 403,
    description: 'You can only edit your own comments',
  })
  @Patch(':id')
  async update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() updateCommentDto: UpdateCommentDto,
    @CurrentUser() user: User,
  ) {
    const comment = await this.commentsService.update(
      id,
      updateCommentDto,
      user.id,
      user.role,
    );

    // Broadcast to project members and owner
    this.chatGateway.publishProjectUpdate(
      'comment_updated',
      comment,
      this.getCommentRecipients(comment),
    );

    return comment;
  }

  @ApiOperation({ summary: 'Delete comment' })
  @ApiResponse({ status: 200, description: 'Comment deleted successfully' })
  @ApiResponse({ status: 404, description: 'Comment not found' })
  @ApiResponse({ status: 403, description: 'Insufficient permissions' })
  @Delete(':id')
  async remove(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: User,
  ) {
    // Get comment first to know who to notify
    const comment = await this.commentsService.findOne(id, user.id, user.role);

    await this.commentsService.remove(id, user.id, user.role);

    // Broadcast deletion to project members and owner
    this.chatGateway.publishProjectUpdate(
      'comment_deleted',
      { id, taskId: comment.task?.id },
      this.getCommentRecipients(comment),
    );

    return { message: 'Comment deleted successfully' };
  }
}
