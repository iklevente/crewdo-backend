import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
  Inject,
} from '@nestjs/common';
import { Repository, DataSource, In } from 'typeorm';
import {
  Channel,
  User,
  ChannelType,
  ChannelVisibility,
  Message,
  MessageReadReceipt,
} from '../entities/index';
import {
  CreateChannelDto,
  CreateDirectMessageDto,
  UpdateChannelDto,
  ChannelResponseDto,
} from '../dto/channel.dto';

@Injectable()
export class ChannelService {
  private channelRepository: Repository<Channel>;
  private userRepository: Repository<User>;
  private messageRepository: Repository<Message>;
  private readReceiptRepository: Repository<MessageReadReceipt>;

  constructor(
    @Inject('DATA_SOURCE')
    private dataSource: DataSource,
  ) {
    this.channelRepository = this.dataSource.getRepository(Channel);
    this.userRepository = this.dataSource.getRepository(User);
    this.messageRepository = this.dataSource.getRepository(Message);
    this.readReceiptRepository =
      this.dataSource.getRepository(MessageReadReceipt);
  }

  async create(
    createChannelDto: CreateChannelDto,
    userId: string,
  ): Promise<ChannelResponseDto> {
    const creator = await this.userRepository.findOne({
      where: { id: userId },
    });
    if (!creator) {
      throw new NotFoundException('Creator not found');
    }

    // Get initial members
    const members = [creator];
    if (createChannelDto.memberIds) {
      const additionalMembers = await this.userRepository.find({
        where: { id: In(createChannelDto.memberIds) },
      });
      members.push(...additionalMembers.filter((m) => m.id !== userId));
    }

    const channel = this.channelRepository.create({
      name: createChannelDto.name,
      description: createChannelDto.description,
      type: createChannelDto.type || ChannelType.TEXT,
      visibility: createChannelDto.visibility || ChannelVisibility.PUBLIC,
      topic: createChannelDto.topic,
      workspaceId: createChannelDto.workspaceId,
      projectId: createChannelDto.projectId,
      creator,
      creatorId: userId,
      members,
    });

    const savedChannel = await this.channelRepository.save(channel);
    return this.formatChannelResponse(savedChannel, userId);
  }

  async createDirectMessage(
    createDmDto: CreateDirectMessageDto,
    userId: string,
  ): Promise<ChannelResponseDto> {
    const currentUser = await this.userRepository.findOne({
      where: { id: userId },
    });
    if (!currentUser) {
      throw new NotFoundException('Current user not found');
    }

    // Get all users for DM - deduplicate to avoid counting the same user twice
    const allUserIds = [...new Set([...createDmDto.userIds, userId])];
    const users = await this.userRepository.find({
      where: { id: In(allUserIds) },
    });

    if (users.length !== allUserIds.length) {
      throw new BadRequestException('Some users not found');
    }

    // Check if DM already exists
    const existingDm = await this.channelRepository
      .createQueryBuilder('channel')
      .leftJoinAndSelect('channel.members', 'members')
      .where('channel.type IN (:...types)', {
        types: [ChannelType.DM, ChannelType.GROUP_DM],
      })
      .andWhere((qb) => {
        const subQuery = qb
          .subQuery()
          .select('1')
          .from('channel_members', 'cm')
          .where('cm.channelId = channel.id')
          .andWhere('cm.userId IN (:...userIds)', { userIds: allUserIds })
          .groupBy('cm.channelId')
          .having('COUNT(cm.userId) = :memberCount', {
            memberCount: allUserIds.length,
          })
          .getQuery();
        return `EXISTS ${subQuery}`;
      })
      .getOne();

    if (existingDm) {
      return this.formatChannelResponse(existingDm, userId);
    }

    // Create new DM
    const channelType =
      allUserIds.length === 2 ? ChannelType.DM : ChannelType.GROUP_DM;
    const channelName =
      createDmDto.name ||
      (channelType === ChannelType.DM
        ? users.find((u) => u.id !== userId)?.firstName +
          ' ' +
          users.find((u) => u.id !== userId)?.lastName
        : users.map((u) => u.firstName).join(', '));

    const channel = this.channelRepository.create({
      name: channelName,
      type: channelType,
      visibility: ChannelVisibility.PRIVATE,
      creator: currentUser,
      creatorId: userId,
      members: users,
    });

    const savedChannel = await this.channelRepository.save(channel);
    return this.formatChannelResponse(savedChannel, userId);
  }

  async findByWorkspace(
    workspaceId: string,
    userId: string,
  ): Promise<ChannelResponseDto[]> {
    try {
      // First, check if the workspace exists
      if (!workspaceId) {
        throw new Error('Workspace ID is required');
      }

      // Simplified query to avoid complex joins that might fail
      const channels = await this.channelRepository
        .createQueryBuilder('channel')
        .leftJoinAndSelect('channel.members', 'members')
        .leftJoinAndSelect('channel.creator', 'creator')
        .where('channel.workspaceId = :workspaceId', { workspaceId })
        .andWhere('channel.isArchived = :isArchived', { isArchived: false })
        .andWhere('members.id = :userId', { userId })
        .orderBy('channel.createdAt', 'ASC')
        .getMany();

      if (!channels || channels.length === 0) {
        console.log(
          `No channels found for workspace ${workspaceId} and user ${userId}`,
        );
        return [];
      }

      const formattedChannels: ChannelResponseDto[] = [];
      for (const channel of channels) {
        try {
          const formatted = await this.formatChannelResponse(channel, userId);
          formattedChannels.push(formatted);
        } catch (formatError) {
          console.error(`Error formatting channel ${channel.id}:`, formatError);
          // Skip this channel but continue with others
        }
      }

      return formattedChannels;
    } catch (error) {
      console.error('Error in findByWorkspace:', error);
      if (error instanceof Error) {
        console.error('Stack trace:', error.stack);
      }
      // Return empty array instead of throwing to prevent 500 errors
      return [];
    }
  }

  async findDirectMessages(userId: string): Promise<ChannelResponseDto[]> {
    const channels = await this.channelRepository
      .createQueryBuilder('channel')
      .leftJoinAndSelect('channel.members', 'members')
      .leftJoinAndSelect('channel.creator', 'creator')
      .where('channel.type IN (:...types)', {
        types: [ChannelType.DM, ChannelType.GROUP_DM],
      })
      .andWhere('members.id = :userId', { userId })
      .andWhere('channel.isArchived = :isArchived', { isArchived: false })
      .orderBy('channel.updatedAt', 'DESC')
      .getMany();

    return Promise.all(
      channels.map((channel) => this.formatChannelResponse(channel, userId)),
    );
  }

  async findOne(id: string, userId: string): Promise<ChannelResponseDto> {
    const channel = await this.channelRepository
      .createQueryBuilder('channel')
      .leftJoinAndSelect('channel.members', 'members')
      .leftJoinAndSelect('channel.creator', 'creator')
      .leftJoinAndSelect('channel.workspace', 'workspace')
      .leftJoinAndSelect('channel.project', 'project')
      .where('channel.id = :id', { id })
      .getOne();

    if (!channel) {
      throw new NotFoundException('Channel not found');
    }

    // Check if user has access
    const isMember = channel.members.some((member) => member.id === userId);
    if (!isMember && channel.visibility === ChannelVisibility.PRIVATE) {
      throw new ForbiddenException('Access denied to this channel');
    }

    return this.formatChannelResponse(channel, userId);
  }

  async update(
    id: string,
    updateChannelDto: UpdateChannelDto,
    userId: string,
  ): Promise<ChannelResponseDto> {
    const channel = await this.channelRepository.findOne({
      where: { id },
      relations: ['members', 'creator', 'workspace', 'project'],
    });

    if (!channel) {
      throw new NotFoundException('Channel not found');
    }

    // Check permissions - only creator or workspace admin can update
    if (channel.creatorId !== userId) {
      throw new ForbiddenException('Only channel creator can update channel');
    }

    // Update fields
    if (updateChannelDto.name !== undefined) {
      channel.name = updateChannelDto.name;
    }
    if (updateChannelDto.description !== undefined) {
      channel.description = updateChannelDto.description;
    }
    if (updateChannelDto.topic !== undefined) {
      channel.topic = updateChannelDto.topic;
    }
    if (updateChannelDto.visibility !== undefined) {
      channel.visibility = updateChannelDto.visibility;
    }
    if (updateChannelDto.isArchived !== undefined) {
      channel.isArchived = updateChannelDto.isArchived;
    }

    const updatedChannel = await this.channelRepository.save(channel);
    return this.formatChannelResponse(updatedChannel, userId);
  }

  async remove(id: string, userId: string): Promise<void> {
    const channel = await this.channelRepository.findOne({
      where: { id },
      relations: ['creator', 'members'],
    });

    if (!channel) {
      throw new NotFoundException('Channel not found');
    }

    // Check permissions - only creator can delete
    if (channel.creatorId !== userId) {
      throw new ForbiddenException('Only channel creator can delete channel');
    }

    // For DM channels, just remove the user instead of deleting
    if (
      channel.type === ChannelType.DM ||
      channel.type === ChannelType.GROUP_DM
    ) {
      channel.members = channel.members.filter(
        (member) => member.id !== userId,
      );
      await this.channelRepository.save(channel);
      return;
    }

    // Soft delete - archive instead of hard delete
    channel.isArchived = true;
    await this.channelRepository.save(channel);
  }

  async addMember(
    channelId: string,
    userId: string,
    requesterId: string,
  ): Promise<void> {
    const channel = await this.channelRepository.findOne({
      where: { id: channelId },
      relations: ['members', 'creator'],
    });

    if (!channel) {
      throw new NotFoundException('Channel not found');
    }

    // Check permissions
    const requesterIsMember = channel.members.some(
      (member) => member.id === requesterId,
    );
    if (!requesterIsMember && channel.creatorId !== requesterId) {
      throw new ForbiddenException('Access denied');
    }

    const userToAdd = await this.userRepository.findOne({
      where: { id: userId },
    });

    if (!userToAdd) {
      throw new NotFoundException('User not found');
    }

    // Check if user is already a member
    const isAlreadyMember = channel.members.some(
      (member) => member.id === userId,
    );
    if (isAlreadyMember) {
      throw new BadRequestException('User is already a member');
    }

    channel.members.push(userToAdd);
    await this.channelRepository.save(channel);
  }

  async removeMember(
    channelId: string,
    userId: string,
    requesterId: string,
  ): Promise<void> {
    const channel = await this.channelRepository.findOne({
      where: { id: channelId },
      relations: ['members', 'creator'],
    });

    if (!channel) {
      throw new NotFoundException('Channel not found');
    }

    // Check permissions - creator, the user themselves, or workspace admin
    const canRemove =
      channel.creatorId === requesterId || userId === requesterId;

    if (!canRemove) {
      throw new ForbiddenException('Access denied');
    }

    // Cannot remove creator
    if (userId === channel.creatorId) {
      throw new BadRequestException('Cannot remove channel creator');
    }

    channel.members = channel.members.filter((member) => member.id !== userId);
    await this.channelRepository.save(channel);
  }

  /**
   * Get unread message count for a user in a specific channel
   */
  async getUnreadCount(channelId: string, userId: string): Promise<number> {
    // Get the last read message timestamp for this user in this channel
    const lastReadReceipt = await this.readReceiptRepository.findOne({
      where: { channelId, userId },
      order: { readAt: 'DESC' },
    });

    // Count messages created after the last read receipt
    const queryBuilder = this.messageRepository
      .createQueryBuilder('message')
      .where('message.channelId = :channelId', { channelId })
      .andWhere('message.isDeleted = :isDeleted', { isDeleted: false })
      .andWhere('message.authorId != :userId', { userId }); // Don't count user's own messages

    if (lastReadReceipt) {
      queryBuilder.andWhere('message.createdAt > :lastReadAt', {
        lastReadAt: lastReadReceipt.readAt,
      });
    }

    return await queryBuilder.getCount();
  }

  /**
   * Mark messages as read up to a specific message
   */
  async markMessagesAsRead(
    channelId: string,
    userId: string,
    upToMessageId?: string,
  ): Promise<void> {
    // Verify user has access to the channel
    const channel = await this.channelRepository.findOne({
      where: { id: channelId },
      relations: ['members'],
    });

    if (!channel) {
      throw new NotFoundException('Channel not found');
    }

    const isMember = channel.members.some((member) => member.id === userId);
    if (!isMember) {
      throw new ForbiddenException('Access denied to this channel');
    }

    // Get the target message (last message if not specified)
    let targetMessage: Message;
    if (upToMessageId) {
      const message = await this.messageRepository.findOne({
        where: { id: upToMessageId, channelId, isDeleted: false },
      });
      if (!message) {
        throw new NotFoundException('Message not found');
      }
      targetMessage = message;
    } else {
      const lastMessage = await this.messageRepository.findOne({
        where: { channelId, isDeleted: false },
        order: { createdAt: 'DESC' },
      });
      if (!lastMessage) {
        return; // No messages to mark as read
      }
      targetMessage = lastMessage;
    }

    // Remove any existing read receipts for this user in this channel
    await this.readReceiptRepository.delete({
      userId,
      channelId,
    });

    // Create new read receipt
    const readReceipt = this.readReceiptRepository.create({
      userId,
      messageId: targetMessage.id,
      channelId,
      user: { id: userId } as User,
      message: targetMessage,
      channel: channel,
    });

    await this.readReceiptRepository.save(readReceipt);
  }

  /**
   * Get read status for messages in a channel
   */
  async getMessageReadStatus(
    channelId: string,
    messageIds: string[],
  ): Promise<Record<string, { readBy: string[]; readCount: number }>> {
    const readReceipts = await this.readReceiptRepository.find({
      where: {
        channelId,
        messageId: In(messageIds),
      },
      relations: ['user'],
    });

    const readStatus: Record<string, { readBy: string[]; readCount: number }> =
      {};

    messageIds.forEach((messageId) => {
      const receipts = readReceipts.filter((r) => r.messageId === messageId);
      readStatus[messageId] = {
        readBy: receipts.map((r) => r.userId),
        readCount: receipts.length,
      };
    });

    return readStatus;
  }

  private async formatChannelResponse(
    channel: Channel,
    userId?: string,
  ): Promise<ChannelResponseDto> {
    try {
      // Get message count and last message
      const messageCount = await this.messageRepository.count({
        where: { channelId: channel.id, isDeleted: false },
      });

      const lastMessage = await this.messageRepository.findOne({
        where: { channelId: channel.id, isDeleted: false },
        relations: ['author'],
        order: { createdAt: 'DESC' },
      });

      // Get unread count by finding messages not read by the current user
      let unreadCount = 0;
      if (userId) {
        try {
          unreadCount = await this.getUnreadCount(channel.id, userId);
        } catch (error) {
          console.warn(
            `Failed to get unread count for channel ${channel.id}:`,
            error,
          );
          unreadCount = 0;
        }
      }

      return {
        id: channel.id,
        name: channel.name,
        description: channel.description,
        type: channel.type,
        visibility: channel.visibility,
        topic: channel.topic,
        isArchived: channel.isArchived,
        isThread: channel.isThread,
        createdAt: channel.createdAt,
        updatedAt: channel.updatedAt,
        creator: channel.creator
          ? {
              id: channel.creator.id,
              firstName: channel.creator.firstName,
              lastName: channel.creator.lastName,
              email: channel.creator.email,
            }
          : undefined,
        members:
          channel.members?.map((member) => ({
            id: member.id,
            firstName: member.firstName,
            lastName: member.lastName,
            email: member.email,
            // TODO: Add presence information
          })) || [],
        workspace: channel.workspace
          ? {
              id: (channel.workspace as { id: string; name: string }).id,
              name: (channel.workspace as { id: string; name: string }).name,
            }
          : undefined,
        project: channel.project
          ? {
              id: channel.project.id,
              name: channel.project.name,
            }
          : undefined,
        messageCount,
        unreadCount,
        lastMessage: lastMessage
          ? {
              id: lastMessage.id,
              content: lastMessage.content,
              author: {
                id: lastMessage.author.id,
                firstName: lastMessage.author.firstName,
                lastName: lastMessage.author.lastName,
              },
              createdAt: lastMessage.createdAt,
            }
          : undefined,
      };
    } catch (error) {
      console.error(
        `Error in formatChannelResponse for channel ${channel?.id}:`,
        error,
      );
      throw error;
    }
  }
}
