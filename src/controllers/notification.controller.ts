import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  Query,
  UseGuards,
  Request,
  ParseUUIDPipe,
} from '@nestjs/common';
import {
  ApiTags,
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiParam,
  ApiQuery,
} from '@nestjs/swagger';
import { NotificationService } from '../services/notification.service';
import {
  CreateNotificationDto,
  UpdateNotificationDto,
  NotificationResponseDto,
  NotificationQueryDto,
} from '../dto/notification.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

interface AuthenticatedRequest {
  user: {
    id: string;
    email: string;
    role: string;
  };
}

@ApiTags('notifications')
@Controller('notifications')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class NotificationController {
  constructor(private readonly notificationService: NotificationService) {}

  @Post()
  @ApiOperation({ summary: 'Create a new notification' })
  @ApiResponse({
    status: 201,
    description: 'Notification created successfully',
    type: NotificationResponseDto,
  })
  async create(
    @Body() createNotificationDto: CreateNotificationDto,
  ): Promise<NotificationResponseDto> {
    return this.notificationService.create(createNotificationDto);
  }

  @Get('user/:userId')
  @ApiOperation({ summary: 'Get notifications for a user' })
  @ApiParam({ name: 'userId', description: 'User ID (UUID)' })
  @ApiQuery({
    name: 'type',
    required: false,
    description: 'Filter by notification type',
  })
  @ApiQuery({
    name: 'isRead',
    required: false,
    description: 'Filter by read status',
  })
  @ApiQuery({ name: 'limit', required: false, description: 'Limit results' })
  @ApiQuery({ name: 'offset', required: false, description: 'Offset results' })
  @ApiResponse({
    status: 200,
    description: 'User notifications',
  })
  async findByUser(
    @Param('userId', ParseUUIDPipe) userId: string,
    @Query() queryDto: NotificationQueryDto,
    @Request() req: AuthenticatedRequest,
  ): Promise<{
    notifications: NotificationResponseDto[];
    total: number;
    unreadCount: number;
  }> {
    return this.notificationService.findByUser(userId, req.user.id, queryDto);
  }

  @Get('user/:userId/unread-count')
  @ApiOperation({ summary: 'Get unread notification count for a user' })
  @ApiParam({ name: 'userId', description: 'User ID (UUID)' })
  @ApiResponse({ status: 200, description: 'Unread notification count' })
  async getUnreadCount(
    @Param('userId', ParseUUIDPipe) userId: string,
    @Request() req: AuthenticatedRequest,
  ): Promise<{ count: number }> {
    const count = await this.notificationService.getUnreadCount(
      userId,
      req.user.id,
    );
    return { count };
  }

  @Get('my-notifications')
  @ApiOperation({ summary: 'Get notifications for the current user' })
  @ApiQuery({
    name: 'type',
    required: false,
    description: 'Filter by notification type',
  })
  @ApiQuery({
    name: 'isRead',
    required: false,
    description: 'Filter by read status',
  })
  @ApiQuery({ name: 'limit', required: false, description: 'Limit results' })
  @ApiQuery({ name: 'offset', required: false, description: 'Offset results' })
  @ApiResponse({
    status: 200,
    description: 'Current user notifications',
  })
  async getMyNotifications(
    @Query() queryDto: NotificationQueryDto,
    @Request() req: AuthenticatedRequest,
  ): Promise<{
    notifications: NotificationResponseDto[];
    total: number;
    unreadCount: number;
  }> {
    return this.notificationService.findByUser(
      req.user.id,
      req.user.id,
      queryDto,
    );
  }

  @Get('my-unread-count')
  @ApiOperation({ summary: 'Get unread notification count for current user' })
  @ApiResponse({ status: 200, description: 'Unread notification count' })
  async getMyUnreadCount(
    @Request() req: AuthenticatedRequest,
  ): Promise<{ count: number }> {
    const count = await this.notificationService.getUnreadCount(
      req.user.id,
      req.user.id,
    );
    return { count };
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get notification by ID' })
  @ApiParam({ name: 'id', description: 'Notification ID (UUID)' })
  @ApiResponse({
    status: 200,
    description: 'Notification details',
    type: NotificationResponseDto,
  })
  async findById(
    @Param('id', ParseUUIDPipe) id: string,
    @Request() req: AuthenticatedRequest,
  ): Promise<NotificationResponseDto> {
    return this.notificationService.findById(id, req.user.id);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update notification (mark as read/unread)' })
  @ApiParam({ name: 'id', description: 'Notification ID (UUID)' })
  @ApiResponse({
    status: 200,
    description: 'Notification updated successfully',
    type: NotificationResponseDto,
  })
  async update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() updateNotificationDto: UpdateNotificationDto,
    @Request() req: AuthenticatedRequest,
  ): Promise<NotificationResponseDto> {
    return this.notificationService.update(
      id,
      updateNotificationDto,
      req.user.id,
    );
  }

  @Post('user/:userId/mark-all-read')
  @ApiOperation({ summary: 'Mark all notifications as read for a user' })
  @ApiParam({ name: 'userId', description: 'User ID (UUID)' })
  @ApiResponse({
    status: 200,
    description: 'Number of notifications marked as read',
  })
  async markAllAsRead(
    @Param('userId', ParseUUIDPipe) userId: string,
    @Request() req: AuthenticatedRequest,
  ): Promise<{ markedCount: number }> {
    const markedCount = await this.notificationService.markAllAsRead(
      userId,
      req.user.id,
    );
    return { markedCount };
  }

  @Post('mark-all-read')
  @ApiOperation({
    summary: 'Mark all notifications as read for the current user',
  })
  @ApiResponse({
    status: 200,
    description: 'Number of notifications marked as read',
  })
  async markMyNotificationsAsRead(
    @Request() req: AuthenticatedRequest,
  ): Promise<{ markedCount: number }> {
    const markedCount = await this.notificationService.markAllAsRead(
      req.user.id,
      req.user.id,
    );
    return { markedCount };
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete a notification' })
  @ApiParam({ name: 'id', description: 'Notification ID (UUID)' })
  @ApiResponse({
    status: 200,
    description: 'Notification deleted successfully',
  })
  async deleteNotification(
    @Param('id', ParseUUIDPipe) id: string,
    @Request() req: AuthenticatedRequest,
  ): Promise<{ message: string }> {
    await this.notificationService.deleteNotification(id, req.user.id);
    return { message: 'Notification deleted successfully' };
  }
}
