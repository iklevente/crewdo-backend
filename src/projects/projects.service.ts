import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  Inject,
} from '@nestjs/common';
import { Repository, DataSource, In } from 'typeorm';
import { Project, User, UserRole, Task, Workspace } from '../entities';
import {
  CreateProjectDto,
  UpdateProjectDto,
  AddProjectMembersDto,
} from '../dto/project.dto';

@Injectable()
export class ProjectsService {
  private projectRepository: Repository<Project>;
  private userRepository: Repository<User>;
  private taskRepository: Repository<Task>;
  private workspaceRepository: Repository<Workspace>;

  constructor(
    @Inject('DATA_SOURCE')
    private dataSource: DataSource,
  ) {
    this.projectRepository = this.dataSource.getRepository(Project);
    this.userRepository = this.dataSource.getRepository(User);
    this.taskRepository = this.dataSource.getRepository(Task);
    this.workspaceRepository = this.dataSource.getRepository(Workspace);
  }

  async create(
    createProjectDto: CreateProjectDto,
    ownerId: string,
  ): Promise<Project> {
    const owner = await this.userRepository.findOne({ where: { id: ownerId } });
    if (!owner) {
      throw new NotFoundException('Owner not found');
    }

    const workspace = await this.workspaceRepository.findOne({
      where: { id: createProjectDto.workspaceId },
      relations: ['members'],
    });

    if (!workspace) {
      throw new NotFoundException('Workspace not found');
    }

    const isWorkspaceMember =
      workspace.ownerId === ownerId ||
      workspace.members?.some((member) => member.id === ownerId);

    if (!isWorkspaceMember) {
      throw new ForbiddenException(
        'You must be a member of the workspace to create a project',
      );
    }

    // Get members if provided
    let members: User[] = [];
    if (createProjectDto.memberIds && createProjectDto.memberIds.length > 0) {
      members = await this.userRepository.findBy({
        id: In(createProjectDto.memberIds),
      });
    }

    const project = this.projectRepository.create({
      ...createProjectDto,
      ownerId,
      members,
      workspaceId: workspace.id,
    });

    return await this.projectRepository.save(project);
  }

  async findAll(
    userId: string,
    userRole: UserRole,
    workspaceId?: string,
  ): Promise<Project[]> {
    const queryBuilder = this.projectRepository
      .createQueryBuilder('project')
      .leftJoinAndSelect('project.owner', 'owner')
      .leftJoinAndSelect('project.members', 'members')
      .leftJoinAndSelect('project.workspace', 'workspace')
      .loadRelationCountAndMap('project.taskCount', 'project.tasks');

    // If user is not admin, only show projects they own or are members of
    if (userRole !== UserRole.ADMIN) {
      queryBuilder.where(
        '(project.ownerId = :userId OR members.id = :userId)',
        { userId },
      );
    }

    if (workspaceId) {
      queryBuilder.andWhere('project.workspaceId = :workspaceId', {
        workspaceId,
      });
    }

    return await queryBuilder.getMany();
  }

  async findOne(
    id: string,
    userId: string,
    userRole: UserRole,
  ): Promise<Project> {
    const queryBuilder = this.projectRepository
      .createQueryBuilder('project')
      .leftJoinAndSelect('project.owner', 'owner')
      .leftJoinAndSelect('project.members', 'members')
      .leftJoinAndSelect('project.workspace', 'workspace')
      .loadRelationCountAndMap('project.taskCount', 'project.tasks')
      .where('project.id = :id', { id });

    // If user is not admin, check if they have access to this project
    if (userRole !== UserRole.ADMIN) {
      queryBuilder.andWhere(
        '(project.ownerId = :userId OR members.id = :userId)',
        { userId },
      );
    }

    const project = await queryBuilder.getOne();
    if (!project) {
      throw new NotFoundException('Project not found or access denied');
    }

    return project;
  }

  async update(
    id: string,
    updateProjectDto: UpdateProjectDto,
    userId: string,
    userRole: UserRole,
  ): Promise<Project> {
    const project = await this.findOne(id, userId, userRole);

    // Only owner, project managers, and admins can update projects
    if (
      project.ownerId !== userId &&
      userRole !== UserRole.ADMIN &&
      userRole !== UserRole.PROJECT_MANAGER
    ) {
      throw new ForbiddenException('You can only update your own projects');
    }

    const updatePayload = {
      ...updateProjectDto,
    } as unknown as Partial<Project>;

    if (updateProjectDto.workspaceId) {
      const targetWorkspace = await this.workspaceRepository.findOne({
        where: { id: updateProjectDto.workspaceId },
        relations: ['members'],
      });

      if (!targetWorkspace) {
        throw new NotFoundException('Workspace not found');
      }

      const canUseWorkspace =
        userRole === UserRole.ADMIN ||
        targetWorkspace.ownerId === userId ||
        targetWorkspace.members?.some((member) => member.id === userId);

      if (!canUseWorkspace) {
        throw new ForbiddenException(
          'You must be a member of the workspace to move this project',
        );
      }

      updatePayload.workspaceId = targetWorkspace.id;
    } else {
      delete (updatePayload as Record<string, unknown>).workspaceId;
    }

    await this.projectRepository.update(id, updatePayload);
    return await this.findOne(id, userId, userRole);
  }

  async remove(id: string, userId: string, userRole: UserRole): Promise<void> {
    const project = await this.findOne(id, userId, userRole);

    // Only owner and admins can delete projects
    if (project.ownerId !== userId && userRole !== UserRole.ADMIN) {
      throw new ForbiddenException('You can only delete your own projects');
    }

    // First delete all tasks associated with this project
    await this.taskRepository.delete({ projectId: id });

    // Then delete the project itself
    await this.projectRepository.delete(id);
  }

  async addMembers(
    id: string,
    addMembersDto: AddProjectMembersDto,
    userId: string,
    userRole: UserRole,
  ): Promise<Project> {
    const project = await this.findOne(id, userId, userRole);

    // Only owner, project managers, and admins can add members
    if (
      project.ownerId !== userId &&
      userRole !== UserRole.ADMIN &&
      userRole !== UserRole.PROJECT_MANAGER
    ) {
      throw new ForbiddenException(
        'You can only add members to your own projects',
      );
    }

    const newMembers = await this.userRepository.findBy({
      id: In(addMembersDto.memberIds),
    });
    if (newMembers.length !== addMembersDto.memberIds.length) {
      throw new NotFoundException('Some users not found');
    }

    // Add new members to existing members
    const existingMemberIds = project.members.map((member) => member.id);
    const membersToAdd = newMembers.filter(
      (member) => !existingMemberIds.includes(member.id),
    );

    project.members = [...project.members, ...membersToAdd];
    await this.projectRepository.save(project);

    return await this.findOne(id, userId, userRole);
  }

  async removeMember(
    id: string,
    memberId: string,
    userId: string,
    userRole: UserRole,
  ): Promise<Project> {
    const project = await this.findOne(id, userId, userRole);

    // Only owner, project managers, and admins can remove members
    if (
      project.ownerId !== userId &&
      userRole !== UserRole.ADMIN &&
      userRole !== UserRole.PROJECT_MANAGER
    ) {
      throw new ForbiddenException(
        'You can only remove members from your own projects',
      );
    }

    project.members = project.members.filter(
      (member) => member.id !== memberId,
    );
    await this.projectRepository.save(project);

    return await this.findOne(id, userId, userRole);
  }
}
