import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  UseGuards,
  Request,
  HttpCode,
  HttpStatus,
  Query,
  ParseUUIDPipe,
  ParseIntPipe,
  UseInterceptors,
  UploadedFiles,
} from '@nestjs/common';
import { FilesInterceptor } from '@nestjs/platform-express';
import {
  ApiTags,
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiParam,
  ApiQuery,
  ApiConsumes,
} from '@nestjs/swagger';
import { MessageService } from './message.service';
import { ChannelService } from '../channels/channel.service';
import { ChatGateway } from '../realtime/chat.gateway';
import {
  CreateMessageDto,
  UpdateMessageDto,
  MessageReactionDto,
  MessageResponseDto,
  MessageSearchDto,
  MessageHistoryDto,
} from '../dto/message.dto';
import { MarkAsReadDto, ReadReceiptResponseDto } from '../dto/read-receipt.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { UserRole } from '../entities';

interface AuthenticatedRequest extends Request {
  user: {
    id: string;
    role: UserRole;
    [key: string]: unknown;
  };
}

@ApiTags('messages')
@Controller('messages')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class MessageController {
  constructor(
    private readonly messageService: MessageService,
    private readonly channelService: ChannelService,
    private readonly chatGateway: ChatGateway,
  ) {}

  @Post()
  @ApiOperation({ summary: 'Create a new message' })
  @ApiResponse({
    status: 201,
    description: 'Message created successfully',
    type: MessageResponseDto,
  })
  async create(
    @Body() createMessageDto: CreateMessageDto,
    @Request() req: AuthenticatedRequest,
  ): Promise<MessageResponseDto> {
    const message = await this.messageService.create(
      createMessageDto,
      req.user.id,
    );

    this.chatGateway.sendToChannel(
      createMessageDto.channelId,
      'new_message',
      message,
    );

    return message;
  }

  @Get('channel/:channelId')
  @ApiOperation({ summary: 'Get messages by channel with pagination' })
  @ApiParam({ name: 'channelId', description: 'Channel ID' })
  @ApiQuery({
    name: 'cursor',
    required: false,
    description: 'Pagination cursor',
  })
  @ApiQuery({
    name: 'limit',
    required: false,
    description: 'Number of messages to fetch',
  })
  @ApiQuery({
    name: 'order',
    required: false,
    enum: ['asc', 'desc'],
    description: 'Sort order',
  })
  @ApiResponse({
    status: 200,
    description: 'List of messages with pagination info',
  })
  @ApiResponse({
    status: 403,
    description: 'Forbidden - No access to this channel',
  })
  async findByChannel(
    @Param('channelId', ParseUUIDPipe) channelId: string,
    @Query('cursor') cursor?: string,
    @Query('limit', new ParseIntPipe({ optional: true })) limit?: number,
    @Query('order') order?: 'asc' | 'desc',
    @Request() req?: AuthenticatedRequest,
  ) {
    if (
      cursor &&
      cursor !== '' &&
      cursor !== 'undefined' &&
      cursor !== 'null' &&
      cursor !== 'string'
    ) {
      try {
        void new ParseUUIDPipe().transform(cursor, { type: 'query' });
      } catch {
        cursor = undefined;
      }
    } else {
      cursor = undefined;
    }

    const historyDto: MessageHistoryDto = {
      cursor,
      limit,
      order,
    };
    return this.messageService.findByChannel(
      channelId,
      req?.user.id || '',
      historyDto,
    );
  }

  @Get('thread/:parentMessageId')
  @ApiOperation({ summary: 'Get thread replies for a message' })
  @ApiParam({ name: 'parentMessageId', description: 'Parent message ID' })
  @ApiResponse({
    status: 200,
    description: 'List of thread replies',
    type: [MessageResponseDto],
  })
  async findThreadReplies(
    @Param('parentMessageId', ParseUUIDPipe) parentMessageId: string,
    @Request() req: AuthenticatedRequest,
  ): Promise<MessageResponseDto[]> {
    return this.messageService.findThreadReplies(parentMessageId, req.user.id);
  }

  @Get('search')
  @ApiOperation({ summary: 'Search messages' })
  @ApiQuery({ name: 'query', required: false, description: 'Search query' })
  @ApiQuery({
    name: 'channelId',
    required: false,
    description: 'Channel ID filter',
  })
  @ApiQuery({
    name: 'authorId',
    required: false,
    description: 'Author ID filter',
  })
  @ApiQuery({
    name: 'hasAttachments',
    required: false,
    description: 'Filter by attachments',
  })
  @ApiQuery({
    name: 'isPinned',
    required: false,
    description: 'Filter by pinned messages',
  })
  @ApiQuery({
    name: 'fromDate',
    required: false,
    description: 'From date filter',
  })
  @ApiQuery({ name: 'toDate', required: false, description: 'To date filter' })
  @ApiResponse({
    status: 200,
    description: 'Search results',
    type: [MessageResponseDto],
  })
  @ApiResponse({
    status: 403,
    description: 'Forbidden - No access to specified channels',
  })
  async search(
    @Query() searchDto: MessageSearchDto,
    @Request() req: AuthenticatedRequest,
  ): Promise<MessageResponseDto[]> {
    return this.messageService.search(searchDto, req.user.id);
  }

  @Get('channel/:channelId/pinned')
  @ApiOperation({ summary: 'Get pinned messages in channel' })
  @ApiParam({ name: 'channelId', description: 'Channel ID' })
  @ApiResponse({
    status: 200,
    description: 'List of pinned messages',
    type: [MessageResponseDto],
  })
  @ApiResponse({
    status: 403,
    description: 'Forbidden - No access to this channel',
  })
  async getPinnedMessages(
    @Param('channelId', ParseUUIDPipe) channelId: string,
    @Request() req: AuthenticatedRequest,
  ): Promise<MessageResponseDto[]> {
    return this.messageService.getPinnedMessages(channelId, req.user.id);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get message by ID' })
  @ApiParam({ name: 'id', description: 'Message ID' })
  @ApiResponse({
    status: 200,
    description: 'Message details',
    type: MessageResponseDto,
  })
  async findOne(
    @Param('id', ParseUUIDPipe) id: string,
    @Request() req: AuthenticatedRequest,
  ): Promise<MessageResponseDto> {
    return this.messageService.findOne(id, req.user.id);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update message' })
  @ApiParam({ name: 'id', description: 'Message ID' })
  @ApiResponse({
    status: 200,
    description: 'Message updated successfully',
    type: MessageResponseDto,
  })
  async update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() updateMessageDto: UpdateMessageDto,
    @Request() req: AuthenticatedRequest,
  ): Promise<MessageResponseDto> {
    return this.messageService.update(id, updateMessageDto, req.user.id);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete message' })
  @ApiParam({ name: 'id', description: 'Message ID' })
  @ApiResponse({ status: 204, description: 'Message deleted successfully' })
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(
    @Param('id', ParseUUIDPipe) id: string,
    @Request() req: AuthenticatedRequest,
  ): Promise<void> {
    return this.messageService.remove(id, req.user.id);
  }

  @Post('reactions')
  @ApiOperation({ summary: 'Add or remove reaction to message' })
  @ApiResponse({ status: 201, description: 'Reaction toggled successfully' })
  async addReaction(
    @Body() messageReactionDto: MessageReactionDto,
    @Request() req: AuthenticatedRequest,
  ): Promise<void> {
    const result = await this.messageService.addReaction(
      messageReactionDto,
      req.user.id,
    );

    this.chatGateway.sendToChannel(result.channelId, 'reaction_updated', {
      messageId: messageReactionDto.messageId,
      emoji: messageReactionDto.emoji,
      userId: req.user.id,
      action: 'toggle',
    });
  }

  @Post('channel/:channelId/mark-read')
  @ApiOperation({ summary: 'Mark messages as read in a channel' })
  @ApiParam({ name: 'channelId', description: 'Channel ID' })
  @ApiResponse({
    status: 201,
    description: 'Messages marked as read successfully',
    type: ReadReceiptResponseDto,
  })
  async markChannelAsRead(
    @Param('channelId', ParseUUIDPipe) channelId: string,
    @Body() markAsReadDto: MarkAsReadDto,
    @Request() req: AuthenticatedRequest,
  ): Promise<ReadReceiptResponseDto> {
    await this.channelService.markMessagesAsRead(
      channelId,
      req.user.id,
      req.user.role,
      markAsReadDto.upToMessageId,
    );

    return {
      message: 'Messages marked as read successfully',
      markedAsRead: await this.channelService.getUnreadCount(
        channelId,
        req.user.id,
      ),
    };
  }

  @Get('channel/:channelId/read-status')
  @ApiOperation({ summary: 'Get read status for messages in a channel' })
  @ApiParam({ name: 'channelId', description: 'Channel ID' })
  @ApiQuery({
    name: 'messageIds',
    required: true,
    description: 'Comma-separated list of message IDs',
  })
  @ApiResponse({
    status: 200,
    description: 'Read status for messages',
  })
  async getMessageReadStatus(
    @Param('channelId', ParseUUIDPipe) channelId: string,
    @Query('messageIds') messageIds: string,
  ): Promise<Record<string, { readBy: string[]; readCount: number }>> {
    const messageIdArray = messageIds.split(',').filter(Boolean);
    return this.channelService.getMessageReadStatus(channelId, messageIdArray);
  }

  @Post('channel/:channelId/attachments')
  @ApiOperation({ summary: 'Upload attachments for messages in a channel' })
  @ApiParam({ name: 'channelId', description: 'Channel ID' })
  @ApiConsumes('multipart/form-data')
  @ApiResponse({
    status: 201,
    description: 'Files uploaded successfully',
  })
  @ApiResponse({
    status: 403,
    description: 'Forbidden - No access to upload to this channel',
  })
  @UseInterceptors(FilesInterceptor('files', 10))
  async uploadMessageAttachments(
    @Param('channelId', ParseUUIDPipe) channelId: string,
    @UploadedFiles() files: Express.Multer.File[],
    @Request() req: AuthenticatedRequest,
  ): Promise<{ attachmentIds: string[] }> {
    return this.messageService.uploadMessageAttachments(
      files,
      channelId,
      req.user.id,
    );
  }
}
