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
} from '@nestjs/common';
import {
  ApiTags,
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiParam,
  ApiQuery,
} from '@nestjs/swagger';
import { MessageService } from '../services/message.service';
import {
  CreateMessageDto,
  UpdateMessageDto,
  MessageReactionDto,
  MessageResponseDto,
  MessageSearchDto,
  MessageHistoryDto,
} from '../dto/message.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

interface AuthenticatedRequest extends Request {
  user: {
    id: string;
    workspaceId: number;
  };
}

@ApiTags('messages')
@Controller('messages')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class MessageController {
  constructor(private readonly messageService: MessageService) {}

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
    return this.messageService.create(createMessageDto, req.user.id);
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
  async findByChannel(
    @Param('channelId') channelId: string,
    @Query('cursor') cursor?: string,
    @Query('limit') limit?: number,
    @Query('order') order?: 'asc' | 'desc',
    @Request() req?: AuthenticatedRequest,
  ) {
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
    @Param('parentMessageId') parentMessageId: string,
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
  async getPinnedMessages(
    @Param('channelId') channelId: string,
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
  findOne(@Param('id') id: string): Promise<MessageResponseDto> {
    // This would need to be implemented in the service
    throw new Error(`Method not implemented for message ${id}`);
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
    @Param('id') id: string,
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
    @Param('id') id: string,
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
    return this.messageService.addReaction(messageReactionDto, req.user.id);
  }
}
