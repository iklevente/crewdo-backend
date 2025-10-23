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
  Workspace,
  UserRole,
  UserPresence,
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
  private workspaceRepository: Repository<Workspace>;
  private messageRepository: Repository<Message>;
  private readReceiptRepository: Repository<MessageReadReceipt>;
  private presenceRepository: Repository<UserPresence>;

  constructor(
    @Inject('DATA_SOURCE')
    private dataSource: DataSource,
  ) {
    this.channelRepository = this.dataSource.getRepository(Channel);
    this.userRepository = this.dataSource.getRepository(User);
    this.workspaceRepository = this.dataSource.getRepository(Workspace);
    this.messageRepository = this.dataSource.getRepository(Message);
    this.readReceiptRepository =
      this.dataSource.getRepository(MessageReadReceipt);
    this.presenceRepository = this.dataSource.getRepository(UserPresence);
  }

  async create(
    createChannelDto: CreateChannelDto,
    userId: string,
    userRole: UserRole,
  ): Promise<ChannelResponseDto> {
    const creator = await this.userRepository.findOne({
      where: { id: userId },
    });
    if (!creator) {
      throw new NotFoundException('Creator not found');
    }

    let workspace: Workspace | null = null;
    if (createChannelDto.workspaceId) {
      workspace = await this.workspaceRepository.findOne({
        where: { id: createChannelDto.workspaceId },
        relations: ['owner'],
      });

      if (!workspace) {
        throw new NotFoundException('Workspace not found');
      }

      const isAdmin = userRole === UserRole.ADMIN;
      const isWorkspaceOwner = workspace.owner?.id === userId;

      if (!isAdmin && !isWorkspaceOwner) {
        throw new ForbiddenException(
          'Only workspace owner or admin can create channels',
        );
      }
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

    if (workspace) {
      channel.workspace = workspace;
    }

    const savedChannel = await this.channelRepository.save(channel);
    return this.formatChannelResponse(savedChannel, userId);
  }

  async createDirectMessage(
    createDmDto: CreateDirectMessageDto,
    userId: string,
    _userRole: UserRole,
  ): Promise<ChannelResponseDto> {
    void _userRole;
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

    const participantCount = allUserIds.length;
    const channelType =
      participantCount === 2 ? ChannelType.DM : ChannelType.GROUP_DM;

    let existingDm: Channel | null = null;
    if (channelType === ChannelType.DM) {
      const candidateChannels = await this.channelRepository
        .createQueryBuilder('channel')
        .leftJoinAndSelect('channel.members', 'members')
        .where('channel.type = :type', { type: ChannelType.DM })
        .andWhere('channel.isArchived = :isArchived', { isArchived: false })
        .andWhere('members.id IN (:...userIds)', { userIds: allUserIds })
        .getMany();

      existingDm =
        candidateChannels.find((channel) => {
          const memberIds = channel.members.map((member) => member.id);
          if (memberIds.length !== participantCount) {
            return false;
          }
          return memberIds.every((memberId) => allUserIds.includes(memberId));
        }) ?? null;
    }

    if (existingDm) {
      return this.formatChannelResponse(existingDm, userId);
    }

    // Create new DM
    const describeUser = (user: User | undefined): string => {
      if (!user) {
        return 'Unknown user';
      }
      const fullName = `${user.firstName ?? ''} ${user.lastName ?? ''}`.trim();
      if (fullName.length > 0) {
        return fullName;
      }
      return user.email;
    };

    const otherParticipants = users.filter(
      (participant) => participant.id !== userId,
    );
    const channelName =
      createDmDto.name?.trim() && createDmDto.name.trim().length > 0
        ? createDmDto.name.trim()
        : channelType === ChannelType.DM
          ? [describeUser(currentUser), describeUser(otherParticipants[0])]
              .filter(Boolean)
              .join(', ')
          : [
              describeUser(currentUser),
              ...otherParticipants.map(describeUser),
            ].join(', ');

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
    userRole: UserRole,
  ): Promise<ChannelResponseDto[]> {
    try {
      // First, check if the workspace exists
      if (!workspaceId) {
        throw new Error('Workspace ID is required');
      }

      // Simplified query to avoid complex joins that might fail
      const queryBuilder = this.channelRepository
        .createQueryBuilder('channel')
        .leftJoinAndSelect('channel.members', 'members')
        .leftJoinAndSelect('channel.creator', 'creator')
        .where('channel.workspaceId = :workspaceId', { workspaceId })
        .andWhere('channel.isArchived = :isArchived', { isArchived: false });

      if (userRole !== UserRole.ADMIN) {
        queryBuilder.andWhere(
          '(members.id = :userId OR channel.visibility = :publicVisibility)',
          {
            userId,
            publicVisibility: ChannelVisibility.PUBLIC,
          },
        );
      }

      const channels = await queryBuilder
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

  async findDirectMessages(
    userId: string,
    _userRole: UserRole,
  ): Promise<ChannelResponseDto[]> {
    void _userRole;
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

  async findOne(
    id: string,
    userId: string,
    userRole: UserRole,
  ): Promise<ChannelResponseDto> {
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
    const isAdmin = userRole === UserRole.ADMIN;
    if (
      !isAdmin &&
      !isMember &&
      channel.visibility === ChannelVisibility.PRIVATE
    ) {
      throw new ForbiddenException('Access denied to this channel');
    }

    return this.formatChannelResponse(channel, userId);
  }

  async update(
    id: string,
    updateChannelDto: UpdateChannelDto,
    userId: string,
    userRole: UserRole,
  ): Promise<ChannelResponseDto> {
    const channel = await this.channelRepository.findOne({
      where: { id },
      relations: ['members', 'creator', 'workspace', 'project'],
    });

    if (!channel) {
      throw new NotFoundException('Channel not found');
    }

    // Check permissions - only creator or workspace admin can update
    const isCreator = channel.creatorId === userId;
    const isAdmin = userRole === UserRole.ADMIN;

    const isMember = channel.members.some((member) => member.id === userId);
    const isGroupConversation = channel.type === ChannelType.GROUP_DM;

    if (!isCreator && !isAdmin) {
      if (!isGroupConversation || !isMember) {
        throw new ForbiddenException(
          'Only channel creator or admin can update channel',
        );
      }
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
    if (isCreator || isAdmin) {
      if (updateChannelDto.visibility !== undefined) {
        channel.visibility = updateChannelDto.visibility;
      }
      if (updateChannelDto.isArchived !== undefined) {
        channel.isArchived = updateChannelDto.isArchived;
      }
    } else if (
      updateChannelDto.visibility !== undefined ||
      updateChannelDto.isArchived !== undefined
    ) {
      throw new ForbiddenException(
        'Only channel creator or admin can change visibility or archive status',
      );
    }

    const updatedChannel = await this.channelRepository.save(channel);
    return this.formatChannelResponse(updatedChannel, userId);
  }

  async remove(id: string, userId: string, userRole: UserRole): Promise<void> {
    const channel = await this.channelRepository.findOne({
      where: { id },
      relations: ['creator', 'members'],
    });

    if (!channel) {
      throw new NotFoundException('Channel not found');
    }

    const isCreator = channel.creatorId === userId;
    const isAdmin = userRole === UserRole.ADMIN;
    const isMember = channel.members.some((member) => member.id === userId);

    if (channel.type === ChannelType.DM) {
      if (!isMember && !isAdmin) {
        throw new ForbiddenException('Access denied');
      }
      channel.members = channel.members.filter(
        (member) => member.id !== userId,
      );
      await this.channelRepository.save(channel);
      return;
    }

    if (channel.type === ChannelType.GROUP_DM) {
      if (isCreator || isAdmin) {
        channel.isArchived = true;
        await this.channelRepository.save(channel);
        return;
      }

      if (!isMember) {
        throw new ForbiddenException('Access denied');
      }

      channel.members = channel.members.filter(
        (member) => member.id !== userId,
      );
      await this.channelRepository.save(channel);
      return;
    }

    if (!isCreator && !isAdmin) {
      throw new ForbiddenException(
        'Only channel creator or admin can delete channel',
      );
    }

    channel.isArchived = true;
    await this.channelRepository.save(channel);
  }

  async addMember(
    channelId: string,
    userId: string,
    requesterId: string,
    userRole: UserRole,
  ): Promise<void> {
    const channel = await this.channelRepository.findOne({
      where: { id: channelId },
      relations: ['members', 'creator', 'workspace', 'workspace.owner'],
    });

    if (!channel) {
      throw new NotFoundException('Channel not found');
    }

    const isCreator = channel.creatorId === requesterId;
    const isAdmin = userRole === UserRole.ADMIN;
    const isWorkspaceOwner = channel.workspace?.owner?.id === requesterId;

    if (!isCreator && !isAdmin && !isWorkspaceOwner) {
      throw new ForbiddenException(
        'Only channel creator, workspace owner, or admin can add members',
      );
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
    userRole: UserRole,
  ): Promise<void> {
    const channel = await this.channelRepository.findOne({
      where: { id: channelId },
      relations: ['members', 'creator', 'workspace', 'workspace.owner'],
    });

    if (!channel) {
      throw new NotFoundException('Channel not found');
    }

    const isCreator = channel.creatorId === requesterId;
    const isAdmin = userRole === UserRole.ADMIN;
    const isWorkspaceOwner = channel.workspace?.owner?.id === requesterId;
    const isSelfRemoval = userId === requesterId;

    if (!isCreator && !isAdmin && !isWorkspaceOwner && !isSelfRemoval) {
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
    userRole: UserRole,
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
    const isAdmin = userRole === UserRole.ADMIN;

    if (!isMember && !isAdmin) {
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

      let members = (channel.members as User[] | undefined) || [];
      if (members.length === 0) {
        const reloaded = await this.channelRepository.findOne({
          where: { id: channel.id },
          relations: ['members'],
        });
        members = reloaded?.members || [];
      }

      let presenceByUser = new Map<string, UserPresence>();
      if (members.length > 0) {
        const presenceRecords = await this.presenceRepository.find({
          where: { userId: In(members.map((member) => member.id)) },
        });
        presenceByUser = new Map(
          presenceRecords.map((presence) => [presence.userId, presence]),
        );
      }

      const formattedMembers = members.map((member) => {
        const presence = presenceByUser.get(member.id);
        return {
          id: member.id,
          firstName: member.firstName,
          lastName: member.lastName,
          email: member.email,
          presence: presence
            ? {
                status: presence.status,
                statusSource: presence.statusSource,
                manualStatus: presence.manualStatus,
                lastSeenAt: presence.lastSeenAt,
              }
            : undefined,
        };
      });

      return {
        id: channel.id,
        name: channel.name,
        description: channel.description,
        type: channel.type,
        visibility: channel.visibility,
        topic: channel.topic,
        isArchived: channel.isArchived,
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
        members: formattedMembers,
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
