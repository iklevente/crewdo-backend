import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
  Inject,
} from '@nestjs/common';
import { Repository, DataSource, In, FindManyOptions } from 'typeorm';
import {
  Workspace,
  User,
  Channel,
  Message,
  Project,
  MessageReadReceipt,
  ChannelType,
  ChannelVisibility,
  UserRole,
  UserPresence,
} from '../entities';
import {
  CreateWorkspaceDto,
  UpdateWorkspaceDto,
  WorkspaceResponseDto,
} from '../dto/workspace.dto';
import { ChatGateway } from '../realtime/chat.gateway';

@Injectable()
export class WorkspaceService {
  private workspaceRepository: Repository<Workspace>;
  private userRepository: Repository<User>;
  private channelRepository: Repository<Channel>;
  private projectRepository: Repository<Project>;
  private messageRepository: Repository<Message>;
  private messageReadReceiptRepository: Repository<MessageReadReceipt>;
  private presenceRepository: Repository<UserPresence>;

  constructor(
    @Inject('DATA_SOURCE')
    private dataSource: DataSource,
    private readonly chatGateway: ChatGateway,
  ) {
    this.workspaceRepository = this.dataSource.getRepository(Workspace);
    this.userRepository = this.dataSource.getRepository(User);
    this.channelRepository = this.dataSource.getRepository(Channel);
    this.projectRepository = this.dataSource.getRepository(Project);
    this.messageRepository = this.dataSource.getRepository(Message);
    this.messageReadReceiptRepository =
      this.dataSource.getRepository(MessageReadReceipt);
    this.presenceRepository = this.dataSource.getRepository(UserPresence);
  }

  async create(
    createWorkspaceDto: CreateWorkspaceDto,
    ownerId: string,
  ): Promise<WorkspaceResponseDto> {
    const owner = await this.userRepository.findOne({ where: { id: ownerId } });
    if (!owner) {
      throw new NotFoundException('Owner not found');
    }

    const userWorkspaceCount = await this.workspaceRepository.count({
      where: { owner: { id: ownerId } },
    });

    if (userWorkspaceCount >= 10) {
      throw new BadRequestException('Maximum workspace limit reached');
    }

    const workspace = this.workspaceRepository.create({
      ...createWorkspaceDto,
      owner,
      members: [owner],
    });

    const savedWorkspace = await this.workspaceRepository.save(workspace);

    const generalChannel = this.channelRepository.create({
      name: 'general',
      description: 'General discussion',
      type: ChannelType.TEXT,
      visibility: ChannelVisibility.PUBLIC,
      workspace: savedWorkspace,
      creator: owner,
      members: [owner],
    });

    await this.channelRepository.save(generalChannel);

    const workspaceWithRelations = await this.workspaceRepository.findOne({
      where: { id: savedWorkspace.id },
      relations: ['owner', 'members'],
    });

    if (workspaceWithRelations) {
      this.broadcastWorkspaceEvent('workspace_created', workspaceWithRelations);
    }

    return await this.formatWorkspaceResponse(
      workspaceWithRelations ?? savedWorkspace,
      ownerId,
      owner.role,
    );
  }

  async findAll(
    userId: string,
    userRole: UserRole,
  ): Promise<WorkspaceResponseDto[]> {
    const baseFindOptions: FindManyOptions<Workspace> = {
      relations: [
        'owner',
        'members',
        'channels',
        'channels.members',
        'channels.creator',
      ],
      order: { updatedAt: 'DESC' },
    };

    const workspaces =
      userRole === UserRole.ADMIN
        ? await this.workspaceRepository.find(baseFindOptions)
        : await this.workspaceRepository.find({
            ...baseFindOptions,
            where: [{ owner: { id: userId } }, { members: { id: userId } }],
          });

    return await Promise.all(
      workspaces.map((workspace) =>
        this.formatWorkspaceResponse(workspace, userId, userRole),
      ),
    );
  }

  async findOne(
    id: string,
    userId: string,
    userRole: UserRole,
  ): Promise<WorkspaceResponseDto> {
    const workspace = await this.workspaceRepository.findOne({
      where: { id },
      relations: [
        'owner',
        'members',
        'channels',
        'channels.members',
        'channels.creator',
        'channels.messages',
        'channels.messages.author',
      ],
    });

    if (!workspace) {
      throw new NotFoundException('Workspace not found');
    }

    if (userRole !== UserRole.ADMIN) {
      const isMember = workspace.members.some((member) => member.id === userId);
      if (!isMember) {
        throw new ForbiddenException('Access denied to this workspace');
      }
    }

    return await this.formatWorkspaceResponse(workspace, userId, userRole);
  }

  async update(
    id: string,
    updateWorkspaceDto: UpdateWorkspaceDto,
    userId: string,
    userRole: UserRole,
  ): Promise<WorkspaceResponseDto> {
    const workspace = await this.workspaceRepository.findOne({
      where: { id },
      relations: ['owner', 'members'],
    });

    if (!workspace) {
      throw new NotFoundException('Workspace not found');
    }

    const isOwner = workspace.owner.id === userId;
    const isAdmin = userRole === UserRole.ADMIN;

    if (!isOwner && !isAdmin) {
      throw new ForbiddenException(
        'Only workspace owner or admin can update workspace',
      );
    }

    Object.assign(workspace, updateWorkspaceDto);
    const updatedWorkspace = await this.workspaceRepository.save(workspace);

    this.broadcastWorkspaceEvent('workspace_updated', updatedWorkspace);

    return await this.formatWorkspaceResponse(
      updatedWorkspace,
      userId,
      userRole,
    );
  }

  async remove(id: string, userId: string, userRole: UserRole): Promise<void> {
    const workspace = await this.workspaceRepository.findOne({
      where: { id },
      relations: ['owner', 'members'],
    });

    if (!workspace) {
      throw new NotFoundException('Workspace not found');
    }

    const isOwner = workspace.owner.id === userId;
    const isAdmin = userRole === UserRole.ADMIN;

    if (!isOwner && !isAdmin) {
      throw new ForbiddenException(
        'Only workspace owner or admin can delete workspace',
      );
    }

    const channels = await this.channelRepository.find({
      where: { workspaceId: id },
      select: ['id'],
    });
    const channelIds = channels.map((channel) => channel.id);

    if (channelIds.length > 0) {
      await this.messageReadReceiptRepository.delete({
        channelId: In(channelIds),
      });
      await this.messageRepository.delete({ channelId: In(channelIds) });
    }

    await this.projectRepository.delete({ workspaceId: id });

    await this.channelRepository.delete({ workspaceId: id });

    const recipients = this.getWorkspaceRecipientIds(workspace);

    await this.workspaceRepository.remove(workspace);

    if (recipients.length > 0) {
      this.chatGateway.broadcastToUsers(
        'workspace_deleted',
        { workspaceId: id },
        recipients,
      );
    }
  }

  async addMember(
    workspaceId: string,
    userEmail: string,
    inviterId: string,
    userRole: UserRole,
  ): Promise<void> {
    const workspace = await this.workspaceRepository.findOne({
      where: { id: workspaceId },
      relations: ['owner', 'members'],
    });

    if (!workspace) {
      throw new NotFoundException('Workspace not found');
    }

    const isOwner = workspace.owner.id === inviterId;
    const isAdmin = userRole === UserRole.ADMIN;

    if (!isOwner && !isAdmin) {
      throw new ForbiddenException(
        'Only workspace owner or admin can add members',
      );
    }

    const user = await this.userRepository.findOne({
      where: { email: userEmail },
    });
    if (!user) {
      throw new NotFoundException('User not found');
    }

    const isAlreadyMember = workspace.members.some(
      (member) => member.id === user.id,
    );
    if (isAlreadyMember) {
      throw new BadRequestException('User is already a member');
    }

    workspace.members.push(user);
    await this.workspaceRepository.save(workspace);

    const generalChannel = await this.channelRepository.findOne({
      where: {
        workspace: { id: workspaceId },
        name: 'general',
      },
      relations: ['members'],
    });

    if (generalChannel) {
      generalChannel.members.push(user);
      await this.channelRepository.save(generalChannel);

      this.broadcastChannelUpdateFromWorkspace(generalChannel, workspace);
    }

    this.notifyWorkspaceMembers(workspace, 'workspace_member_added', {
      workspaceId,
      member: {
        id: user.id,
        firstName: user.firstName,
        lastName: user.lastName,
        email: user.email,
      },
    });

    this.broadcastWorkspaceEvent('workspace_updated', workspace);

    this.chatGateway.sendToUser(user.id, 'workspace_created', {
      workspaceId,
    });
  }

  async removeMember(
    workspaceId: string,
    userId: string,
    removerId: string,
    userRole: UserRole,
  ): Promise<void> {
    const workspace = await this.workspaceRepository.findOne({
      where: { id: workspaceId },
      relations: ['owner', 'members'],
    });

    if (!workspace) {
      throw new NotFoundException('Workspace not found');
    }

    if (workspace.owner.id === userId) {
      throw new BadRequestException('Workspace owner cannot be removed');
    }

    const isOwner = workspace.owner.id === removerId;
    const isAdmin = userRole === UserRole.ADMIN;
    const isSelfRemoval = userId === removerId;

    if (!isOwner && !isAdmin && !isSelfRemoval) {
      throw new ForbiddenException(
        'Only workspace owner or admin can remove members',
      );
    }

    workspace.members = workspace.members.filter(
      (member) => member.id !== userId,
    );
    await this.workspaceRepository.save(workspace);

    const channels = await this.channelRepository.find({
      where: { workspace: { id: workspaceId } },
      relations: ['members'],
    });

    for (const channel of channels) {
      channel.members = channel.members.filter(
        (member) => member.id !== userId,
      );
      await this.channelRepository.save(channel);

      this.broadcastChannelUpdateFromWorkspace(channel, workspace);

      if (channel.id) {
        this.chatGateway.sendToUser(userId, 'channel_deleted', {
          channelId: channel.id,
          workspaceId,
        });
      }
    }

    this.notifyWorkspaceMembers(workspace, 'workspace_member_removed', {
      workspaceId,
      memberId: userId,
    });

    this.broadcastWorkspaceEvent('workspace_updated', workspace);

    this.chatGateway.sendToUser(userId, 'workspace_deleted', {
      workspaceId,
    });
  }

  async getMembers(workspaceId: string, userId: string, userRole: UserRole) {
    const workspace = await this.workspaceRepository.findOne({
      where: { id: workspaceId },
      relations: ['owner', 'members'],
    });

    if (!workspace) {
      throw new NotFoundException('Workspace not found');
    }

    if (userRole !== UserRole.ADMIN) {
      const isMember = workspace.members.some((member) => member.id === userId);
      if (!isMember) {
        throw new ForbiddenException('Access denied');
      }
    }

    const allMemberIds = [
      workspace.owner.id,
      ...workspace.members.map((member) => member.id),
    ];

    const presenceRecords = allMemberIds.length
      ? await this.presenceRepository.find({
          where: { userId: In(allMemberIds) },
        })
      : [];

    const presenceMap = new Map<string, UserPresence>(
      presenceRecords.map((record) => [record.userId, record]),
    );

    const serializePresence = (targetId: string) => {
      const presence = presenceMap.get(targetId);
      if (!presence) {
        return undefined;
      }
      return {
        status: presence.status,
        statusSource: presence.statusSource,
        manualStatus: presence.manualStatus,
        lastSeenAt: presence.lastSeenAt
          ? presence.lastSeenAt.toISOString()
          : null,
        timestamp: presence.updatedAt.toISOString(),
      };
    };

    return {
      owner: {
        id: workspace.owner.id,
        firstName: workspace.owner.firstName,
        lastName: workspace.owner.lastName,
        email: workspace.owner.email,
        presence: serializePresence(workspace.owner.id),
      },
      members: workspace.members
        .filter((member) => member.id !== workspace.owner.id)
        .map((member) => ({
          id: member.id,
          firstName: member.firstName,
          lastName: member.lastName,
          email: member.email,
          presence: serializePresence(member.id),
        })),
    };
  }

  private async formatWorkspaceResponse(
    workspace: Workspace,
    viewerId: string,
    viewerRole: UserRole,
  ): Promise<WorkspaceResponseDto> {
    const channels = (workspace.channels as Channel[] | undefined) || [];

    const visibleChannels = channels.filter((channel) => {
      if (channel.isArchived) {
        return false;
      }

      if (!viewerId) {
        return true;
      }
      if (viewerRole === UserRole.ADMIN) {
        return true;
      }
      if (channel.visibility !== ChannelVisibility.PRIVATE) {
        return true;
      }

      const members = (channel.members as User[] | undefined) || [];
      const isMember = members.some((member) => member.id === viewerId);

      return isMember;
    });

    const unreadCounts = await this.getUnreadCountsForChannels(
      visibleChannels,
      viewerId,
    );

    const channelSummaries = await Promise.all(
      visibleChannels.map(async (channel) => {
        const messages = channel.messages as Message[] | undefined;

        let formattedLastMessage:
          | {
              id: string;
              content: string;
              author: {
                id: string;
                firstName: string;
                lastName: string;
              };
              createdAt: Date;
            }
          | undefined;

        if (messages && messages.length > 0) {
          const lastMessage = messages[messages.length - 1];
          const lastMessageAuthor = lastMessage?.author;
          if (lastMessage && lastMessageAuthor) {
            formattedLastMessage = {
              id: lastMessage.id,
              content: lastMessage.content,
              author: {
                id: lastMessageAuthor.id,
                firstName: lastMessageAuthor.firstName,
                lastName: lastMessageAuthor.lastName,
              },
              createdAt: lastMessage.createdAt,
            };
          }
        } else {
          const lastMessage = await this.messageRepository.findOne({
            where: { channelId: channel.id, isDeleted: false },
            relations: ['author'],
            order: { createdAt: 'DESC' },
          });

          if (lastMessage?.author) {
            formattedLastMessage = {
              id: lastMessage.id,
              content: lastMessage.content,
              author: {
                id: lastMessage.author.id,
                firstName: lastMessage.author.firstName,
                lastName: lastMessage.author.lastName,
              },
              createdAt: lastMessage.createdAt,
            };
          }
        }

        return {
          id: channel.id,
          name: channel.name,
          type: channel.type,
          visibility: channel.visibility,
          unreadCount: unreadCounts[channel.id] ?? 0,
          lastMessage: formattedLastMessage,
        };
      }),
    );

    return {
      id: workspace.id,
      name: workspace.name,
      description: workspace.description,
      type: workspace.type,
      createdAt: workspace.createdAt,
      updatedAt: workspace.updatedAt,
      owner: {
        id: workspace.owner.id,
        firstName: workspace.owner.firstName,
        lastName: workspace.owner.lastName,
        email: workspace.owner.email,
      },
      memberCount: workspace.members?.length || 0,
      channelCount: workspace.channels?.length || 0,
      channels: channelSummaries,
    };
  }

  private async getUnreadCountsForChannels(
    channels: Channel[],
    viewerId: string,
  ): Promise<Record<string, number>> {
    if (!viewerId || channels.length === 0) {
      return {};
    }

    const channelIds = channels
      .map((channel) => channel.id)
      .filter((id): id is string => Boolean(id));

    if (channelIds.length === 0) {
      return {};
    }

    const readReceiptRows = await this.messageReadReceiptRepository
      .createQueryBuilder('receipt')
      .select('receipt.channelId', 'channelId')
      .addSelect('MAX(receipt.readAt)', 'lastReadAt')
      .where('receipt.userId = :userId', { userId: viewerId })
      .andWhere('receipt.channelId IN (:...channelIds)', { channelIds })
      .groupBy('receipt.channelId')
      .getRawMany<{ channelId: string; lastReadAt: string | null }>();

    const lastReadMap = new Map<string, Date>(
      readReceiptRows
        .filter((row) => row.lastReadAt)
        .map((row) => [row.channelId, new Date(row.lastReadAt as string)]),
    );

    const unreadEntries = await Promise.all(
      channelIds.map(async (channelId) => {
        const query = this.messageRepository
          .createQueryBuilder('message')
          .select('COUNT(message.id)', 'count')
          .where('message.channelId = :channelId', { channelId })
          .andWhere('message.isDeleted = :isDeleted', { isDeleted: false })
          .andWhere('message.authorId != :userId', { userId: viewerId });

        const lastReadAt = lastReadMap.get(channelId);
        if (lastReadAt) {
          query.andWhere('message.createdAt > :lastReadAt', { lastReadAt });
        }

        const result = await query.getRawOne<{ count?: string }>();
        return [channelId, result?.count ? Number(result.count) : 0];
      }),
    );

    return Object.fromEntries(unreadEntries) as Record<string, number>;
  }

  private notifyWorkspaceMembers(
    workspace: Workspace,
    event: string,
    payload: Record<string, any>,
  ) {
    const recipients = this.getWorkspaceRecipientIds(workspace);

    recipients.forEach((userId) => {
      this.chatGateway.sendToUser(userId, event, payload);
    });
  }

  private getWorkspaceRecipientIds(workspace: Workspace): string[] {
    const recipients = new Set<string>();

    if (workspace.owner?.id) {
      recipients.add(workspace.owner.id);
    }

    workspace.members?.forEach((member) => {
      if (member?.id) {
        recipients.add(member.id);
      }
    });

    return Array.from(recipients);
  }

  private broadcastWorkspaceEvent(event: string, workspace: Workspace) {
    const recipients = this.getWorkspaceRecipientIds(workspace);

    if (recipients.length === 0) {
      return;
    }

    this.chatGateway.broadcastToUsers(
      event,
      { workspaceId: workspace.id },
      recipients,
    );
  }

  private broadcastChannelUpdateFromWorkspace(
    channel: Channel,
    workspace: Workspace,
  ): void {
    if (!channel?.id) {
      return;
    }

    const recipients = new Set<string>();

    (channel.members ?? [])
      .map((member) => member?.id)
      .filter((value): value is string => Boolean(value))
      .forEach((memberId) => recipients.add(memberId));

    this.getWorkspaceRecipientIds(workspace).forEach((memberId) => {
      if (memberId) {
        recipients.add(memberId);
      }
    });

    if (recipients.size === 0) {
      return;
    }

    this.chatGateway.broadcastToUsers(
      'channel_updated',
      {
        channelId: channel.id,
        workspaceId: workspace.id,
      },
      recipients,
    );
  }
}
