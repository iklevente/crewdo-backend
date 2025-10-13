import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  Inject,
} from '@nestjs/common';
import { Repository, DataSource } from 'typeorm';
import { Notification, User, NotificationType } from '../entities';
import {
  CreateNotificationDto,
  UpdateNotificationDto,
  NotificationResponseDto,
  NotificationQueryDto,
} from '../dto/notification.dto';

@Injectable()
export class NotificationService {
  private notificationRepository: Repository<Notification>;
  private userRepository: Repository<User>;

  constructor(
    @Inject('DATA_SOURCE')
    private dataSource: DataSource,
  ) {
    this.notificationRepository = this.dataSource.getRepository(Notification);
    this.userRepository = this.dataSource.getRepository(User);
  }

  async create(
    createNotificationDto: CreateNotificationDto,
  ): Promise<NotificationResponseDto> {
    const user = await this.userRepository.findOne({
      where: { id: createNotificationDto.userId },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    const notification = this.notificationRepository.create({
      title: createNotificationDto.title,
      message: createNotificationDto.message,
      type: createNotificationDto.type,
      user,
      relatedEntityId: createNotificationDto.relatedEntityId,
      relatedEntityType: createNotificationDto.relatedEntityType,
    });

    const savedNotification =
      await this.notificationRepository.save(notification);

    return this.formatNotificationResponse(savedNotification);
  }

  async findByUser(
    userId: string,
    currentUserId: string,
    queryDto: NotificationQueryDto = {},
  ): Promise<{
    notifications: NotificationResponseDto[];
    total: number;
    unreadCount: number;
  }> {
    // Users can only access their own notifications
    if (userId !== currentUserId) {
      throw new ForbiddenException(
        'You can only access your own notifications',
      );
    }

    const user = await this.userRepository.findOne({ where: { id: userId } });
    if (!user) {
      throw new NotFoundException('User not found');
    }

    const limit = queryDto.limit || 50;
    const offset = queryDto.offset || 0;

    let queryBuilder = this.notificationRepository
      .createQueryBuilder('notification')
      .leftJoinAndSelect('notification.user', 'user')
      .where('notification.userId = :userId', { userId });

    if (queryDto.type) {
      queryBuilder = queryBuilder.andWhere('notification.type = :type', {
        type: queryDto.type,
      });
    }

    if (typeof queryDto.isRead === 'boolean') {
      queryBuilder = queryBuilder.andWhere('notification.isRead = :isRead', {
        isRead: queryDto.isRead,
      });
    }

    const [notifications, total] = await queryBuilder
      .orderBy('notification.createdAt', 'DESC')
      .skip(offset)
      .take(limit)
      .getManyAndCount();

    // Get unread count
    const unreadCount = await this.notificationRepository.count({
      where: { userId, isRead: false },
    });

    return {
      notifications: notifications.map((n) =>
        this.formatNotificationResponse(n),
      ),
      total,
      unreadCount,
    };
  }

  async findById(
    id: string,
    currentUserId: string,
  ): Promise<NotificationResponseDto> {
    const notification = await this.notificationRepository.findOne({
      where: { id },
      relations: ['user'],
    });

    if (!notification) {
      throw new NotFoundException('Notification not found');
    }

    // Users can only access their own notifications
    if (notification.user.id !== currentUserId) {
      throw new ForbiddenException(
        'You can only access your own notifications',
      );
    }

    return this.formatNotificationResponse(notification);
  }

  async update(
    id: string,
    updateNotificationDto: UpdateNotificationDto,
    currentUserId: string,
  ): Promise<NotificationResponseDto> {
    const notification = await this.notificationRepository.findOne({
      where: { id },
      relations: ['user'],
    });

    if (!notification) {
      throw new NotFoundException('Notification not found');
    }

    // Users can only update their own notifications
    if (notification.user.id !== currentUserId) {
      throw new ForbiddenException(
        'You can only update your own notifications',
      );
    }

    if (typeof updateNotificationDto.isRead === 'boolean') {
      notification.isRead = updateNotificationDto.isRead;
    }

    const updatedNotification =
      await this.notificationRepository.save(notification);

    return this.formatNotificationResponse(updatedNotification);
  }

  async markAllAsRead(userId: string, currentUserId: string): Promise<number> {
    // Users can only mark their own notifications as read
    if (userId !== currentUserId) {
      throw new ForbiddenException(
        'You can only mark your own notifications as read',
      );
    }

    const result = await this.notificationRepository.update(
      { userId, isRead: false },
      { isRead: true },
    );

    return result.affected || 0;
  }

  async deleteNotification(id: string, currentUserId: string): Promise<void> {
    const notification = await this.notificationRepository.findOne({
      where: { id },
      relations: ['user'],
    });

    if (!notification) {
      throw new NotFoundException('Notification not found');
    }

    // Users can only delete their own notifications
    if (notification.user.id !== currentUserId) {
      throw new ForbiddenException(
        'You can only delete your own notifications',
      );
    }

    await this.notificationRepository.remove(notification);
  }

  async getUnreadCount(userId: string, currentUserId: string): Promise<number> {
    // Users can only get their own unread count
    if (userId !== currentUserId) {
      throw new ForbiddenException(
        'You can only access your own notification count',
      );
    }

    return await this.notificationRepository.count({
      where: { userId, isRead: false },
    });
  }

  // Helper methods for creating specific notification types
  async createTaskAssignedNotification(
    taskId: string,
    taskTitle: string,
    assigneeId: string,
    assignerId: string,
  ): Promise<NotificationResponseDto> {
    const assigner = await this.userRepository.findOne({
      where: { id: assignerId },
    });

    return this.create({
      title: 'Task Assigned',
      message: `${assigner?.firstName} ${assigner?.lastName} assigned you a task: ${taskTitle}`,
      type: NotificationType.TASK_ASSIGNED,
      userId: assigneeId,
      relatedEntityId: taskId,
      relatedEntityType: 'task',
    });
  }

  async createTaskCompletedNotification(
    taskId: string,
    taskTitle: string,
    projectOwnerId: string,
    completerId: string,
  ): Promise<NotificationResponseDto> {
    const completer = await this.userRepository.findOne({
      where: { id: completerId },
    });

    return this.create({
      title: 'Task Completed',
      message: `${completer?.firstName} ${completer?.lastName} completed the task: ${taskTitle}`,
      type: NotificationType.TASK_COMPLETED,
      userId: projectOwnerId,
      relatedEntityId: taskId,
      relatedEntityType: 'task',
    });
  }

  async createCommentNotification(
    entityId: string,
    entityType: string,
    entityTitle: string,
    commenterId: string,
    recipientId: string,
  ): Promise<NotificationResponseDto> {
    const commenter = await this.userRepository.findOne({
      where: { id: commenterId },
    });

    return this.create({
      title: 'New Comment',
      message: `${commenter?.firstName} ${commenter?.lastName} commented on ${entityType}: ${entityTitle}`,
      type: NotificationType.COMMENT_ADDED,
      userId: recipientId,
      relatedEntityId: entityId,
      relatedEntityType: entityType,
    });
  }

  async createProjectInvitationNotification(
    projectId: string,
    projectName: string,
    inviterId: string,
    inviteeId: string,
  ): Promise<NotificationResponseDto> {
    const inviter = await this.userRepository.findOne({
      where: { id: inviterId },
    });

    return this.create({
      title: 'Project Invitation',
      message: `${inviter?.firstName} ${inviter?.lastName} invited you to join project: ${projectName}`,
      type: NotificationType.PROJECT_INVITATION,
      userId: inviteeId,
      relatedEntityId: projectId,
      relatedEntityType: 'project',
    });
  }

  async createDeadlineNotification(
    entityId: string,
    entityType: string,
    entityTitle: string,
    userId: string,
    daysLeft: number,
  ): Promise<NotificationResponseDto> {
    return this.create({
      title: 'Deadline Approaching',
      message: `${entityTitle} deadline is approaching (${daysLeft} days left)`,
      type: NotificationType.DEADLINE_APPROACHING,
      userId,
      relatedEntityId: entityId,
      relatedEntityType: entityType,
    });
  }

  private formatNotificationResponse(
    notification: Notification,
  ): NotificationResponseDto {
    return {
      id: notification.id,
      title: notification.title,
      message: notification.message,
      type: notification.type,
      isRead: notification.isRead,
      relatedEntityId: notification.relatedEntityId,
      relatedEntityType: notification.relatedEntityType,
      createdAt: notification.createdAt,
      user: {
        id: notification.user.id,
        firstName: notification.user.firstName,
        lastName: notification.user.lastName,
        email: notification.user.email,
      },
    };
  }
}
