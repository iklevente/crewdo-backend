import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
  Inject,
} from '@nestjs/common';
import { Repository, DataSource, In } from 'typeorm';
import {
  Workspace,
  User,
  Channel,
  Message,
  Project,
  Call,
  MessageReadReceipt,
  ChannelType,
  ChannelVisibility,
} from '../entities/index';
import {
  CreateWorkspaceDto,
  UpdateWorkspaceDto,
  WorkspaceResponseDto,
} from '../dto/workspace.dto';

@Injectable()
export class WorkspaceService {
  private workspaceRepository: Repository<Workspace>;
  private userRepository: Repository<User>;
  private channelRepository: Repository<Channel>;
  private projectRepository: Repository<Project>;
  private messageRepository: Repository<Message>;
  private callRepository: Repository<Call>;
  private messageReadReceiptRepository: Repository<MessageReadReceipt>;

  constructor(
    @Inject('DATA_SOURCE')
    private dataSource: DataSource,
  ) {
    this.workspaceRepository = this.dataSource.getRepository(Workspace);
    this.userRepository = this.dataSource.getRepository(User);
    this.channelRepository = this.dataSource.getRepository(Channel);
    this.projectRepository = this.dataSource.getRepository(Project);
    this.messageRepository = this.dataSource.getRepository(Message);
    this.callRepository = this.dataSource.getRepository(Call);
    this.messageReadReceiptRepository =
      this.dataSource.getRepository(MessageReadReceipt);
  }

  async create(
    createWorkspaceDto: CreateWorkspaceDto,
    ownerId: string,
  ): Promise<WorkspaceResponseDto> {
    const owner = await this.userRepository.findOne({ where: { id: ownerId } });
    if (!owner) {
      throw new NotFoundException('Owner not found');
    }

    // Check if user has reached workspace limit (optional business rule)
    const userWorkspaceCount = await this.workspaceRepository.count({
      where: { owner: { id: ownerId } },
    });

    if (userWorkspaceCount >= 10) {
      // Example limit
      throw new BadRequestException('Maximum workspace limit reached');
    }

    const workspace = this.workspaceRepository.create({
      ...createWorkspaceDto,
      owner,
      members: [owner],
    });

    const savedWorkspace = await this.workspaceRepository.save(workspace);

    // Create default general channel
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

    return this.formatWorkspaceResponse(savedWorkspace);
  }

  async findAll(userId: string): Promise<WorkspaceResponseDto[]> {
    const workspaces = await this.workspaceRepository.find({
      where: [{ owner: { id: userId } }, { members: { id: userId } }],
      relations: [
        'owner',
        'members',
        'channels',
        'channels.members',
        'channels.creator',
      ],
      order: { updatedAt: 'DESC' },
    });

    return workspaces.map((workspace) =>
      this.formatWorkspaceResponse(workspace),
    );
  }

  async findOne(id: string, userId: string): Promise<WorkspaceResponseDto> {
    const workspace = await this.workspaceRepository.findOne({
      where: { id },
      relations: [
        'owner',
        'members',
        'channels',
        'channels.members',
        'channels.creator',
        'channels.messages',
      ],
    });

    if (!workspace) {
      throw new NotFoundException('Workspace not found');
    }

    // Check if user is member of workspace
    const isMember = workspace.members.some((member) => member.id === userId);
    if (!isMember) {
      throw new ForbiddenException('Access denied to this workspace');
    }

    return this.formatWorkspaceResponse(workspace);
  }

  async update(
    id: string,
    updateWorkspaceDto: UpdateWorkspaceDto,
    userId: string,
  ): Promise<WorkspaceResponseDto> {
    const workspace = await this.workspaceRepository.findOne({
      where: { id },
      relations: ['owner', 'members'],
    });

    if (!workspace) {
      throw new NotFoundException('Workspace not found');
    }

    // Only owner can update workspace
    if (workspace.owner.id !== userId) {
      throw new ForbiddenException('Only workspace owner can update workspace');
    }

    Object.assign(workspace, updateWorkspaceDto);
    const updatedWorkspace = await this.workspaceRepository.save(workspace);

    return this.formatWorkspaceResponse(updatedWorkspace);
  }

  async remove(id: string, userId: string): Promise<void> {
    const workspace = await this.workspaceRepository.findOne({
      where: { id },
      relations: ['owner'],
    });

    if (!workspace) {
      throw new NotFoundException('Workspace not found');
    }

    // Only owner can delete workspace
    if (workspace.owner.id !== userId) {
      throw new ForbiddenException('Only workspace owner can delete workspace');
    }

    // Manual cascading delete - delete dependent entities first
    // We need to be careful about the order due to foreign key constraints

    // 1. Get all channels in this workspace to clean up their dependent entities
    const channels = await this.channelRepository.find({
      where: { workspaceId: id },
      select: ['id'],
    });
    const channelIds = channels.map((channel) => channel.id);

    if (channelIds.length > 0) {
      // 2. Delete all channel-dependent entities
      await this.messageReadReceiptRepository.delete({
        channelId: In(channelIds),
      });
      await this.callRepository.delete({ channelId: In(channelIds) });
      await this.messageRepository.delete({ channelId: In(channelIds) });
    }

    // 3. Delete all projects in this workspace (which will cascade to tasks)
    await this.projectRepository.delete({ workspaceId: id });

    // 4. Delete all channels in this workspace
    await this.channelRepository.delete({ workspaceId: id });

    // 5. Finally delete the workspace
    await this.workspaceRepository.remove(workspace);
  }

  async addMember(
    workspaceId: string,
    userEmail: string,
    inviterId: string,
  ): Promise<void> {
    const workspace = await this.workspaceRepository.findOne({
      where: { id: workspaceId },
      relations: ['owner', 'members'],
    });

    if (!workspace) {
      throw new NotFoundException('Workspace not found');
    }

    // Check if inviter is member or owner
    const isInviterMember =
      workspace.members.some((member) => member.id === inviterId) ||
      workspace.owner.id === inviterId;

    if (!isInviterMember) {
      throw new ForbiddenException('Access denied');
    }

    const user = await this.userRepository.findOne({
      where: { email: userEmail },
    });
    if (!user) {
      throw new NotFoundException('User not found');
    }

    // Check if user is already a member
    const isAlreadyMember = workspace.members.some(
      (member) => member.id === user.id,
    );
    if (isAlreadyMember) {
      throw new BadRequestException('User is already a member');
    }

    workspace.members.push(user);
    await this.workspaceRepository.save(workspace);

    // Add user to general channel
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
    }
  }

  async removeMember(
    workspaceId: string,
    userId: string,
    removerId: string,
  ): Promise<void> {
    const workspace = await this.workspaceRepository.findOne({
      where: { id: workspaceId },
      relations: ['owner', 'members'],
    });

    if (!workspace) {
      throw new NotFoundException('Workspace not found');
    }

    // Owner cannot be removed
    if (workspace.owner.id === userId) {
      throw new BadRequestException('Workspace owner cannot be removed');
    }

    // Only owner can remove members (or members can remove themselves)
    if (workspace.owner.id !== removerId && userId !== removerId) {
      throw new ForbiddenException('Only workspace owner can remove members');
    }

    workspace.members = workspace.members.filter(
      (member) => member.id !== userId,
    );
    await this.workspaceRepository.save(workspace);

    // Remove user from all channels in workspace
    const channels = await this.channelRepository.find({
      where: { workspace: { id: workspaceId } },
      relations: ['members'],
    });

    for (const channel of channels) {
      channel.members = channel.members.filter(
        (member) => member.id !== userId,
      );
      await this.channelRepository.save(channel);
    }
  }

  async getMembers(workspaceId: string, userId: string) {
    const workspace = await this.workspaceRepository.findOne({
      where: { id: workspaceId },
      relations: ['owner', 'members', 'members.presence'],
    });

    if (!workspace) {
      throw new NotFoundException('Workspace not found');
    }

    // Check if user is member
    const isMember = workspace.members.some((member) => member.id === userId);
    if (!isMember) {
      throw new ForbiddenException('Access denied');
    }

    return {
      owner: {
        id: workspace.owner.id,
        firstName: workspace.owner.firstName,
        lastName: workspace.owner.lastName,
        email: workspace.owner.email,
      },
      members: workspace.members.map((member) => ({
        id: member.id,
        firstName: member.firstName,
        lastName: member.lastName,
        email: member.email,
        joinedAt: member.createdAt, // You might want to add a separate joinedAt field
      })),
    };
  }

  private formatWorkspaceResponse(workspace: Workspace): WorkspaceResponseDto {
    return {
      id: workspace.id,
      name: workspace.name,
      description: workspace.description,
      type: workspace.type,
      avatar: workspace.avatar,
      isPublic: workspace.isPublic,
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
      channels:
        (workspace.channels as Channel[] | undefined)?.map((channel) => {
          const messages = channel.messages as Message[] | undefined;
          const lastMessage =
            messages && messages.length > 0
              ? messages[messages.length - 1]
              : undefined;

          return {
            id: channel.id,
            name: channel.name,
            type: channel.type,
            visibility: channel.visibility,
            unreadCount: 0, // TODO: Calculate actual unread count
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
        }) || [],
    };
  }
}
