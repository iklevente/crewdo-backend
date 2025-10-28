import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  Inject,
} from '@nestjs/common';
import { Repository, DataSource, In } from 'typeorm';
import { Project, User, UserRole, Task } from '../entities';
import {
  CreateProjectDto,
  UpdateProjectDto,
  AddProjectMembersDto,
} from '../dto/project.dto';
import { NotificationService } from '../services/notification.service';

@Injectable()
export class ProjectsService {
  private projectRepository: Repository<Project>;
  private userRepository: Repository<User>;
  private taskRepository: Repository<Task>;

  constructor(
    @Inject('DATA_SOURCE')
    private dataSource: DataSource,
    private readonly notificationService: NotificationService,
  ) {
    this.projectRepository = this.dataSource.getRepository(Project);
    this.userRepository = this.dataSource.getRepository(User);
    this.taskRepository = this.dataSource.getRepository(Task);
  }

  async create(
    createProjectDto: CreateProjectDto,
    ownerId: string,
  ): Promise<Project> {
    const owner = await this.userRepository.findOne({ where: { id: ownerId } });
    if (!owner) {
      throw new NotFoundException('Owner not found');
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
    });

    const savedProject = await this.projectRepository.save(project);

    // Reload project with all relations for websocket broadcasting
    const projectWithRelations = await this.projectRepository
      .createQueryBuilder('project')
      .leftJoinAndSelect('project.owner', 'owner')
      .leftJoinAndSelect('project.members', 'members')
      .loadRelationCountAndMap('project.taskCount', 'project.tasks')
      .where('project.id = :id', { id: savedProject.id })
      .getOne();

    return projectWithRelations || savedProject;
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
    const previousStatus = project.status;

    // Only owner, project managers, and admins can update projects
    if (
      project.ownerId !== userId &&
      userRole !== UserRole.ADMIN &&
      userRole !== UserRole.PROJECT_MANAGER
    ) {
      throw new ForbiddenException('You can only update your own projects');
    }

    await this.projectRepository.update(id, updateProjectDto);
    const updatedProject = await this.findOne(id, userId, userRole);

    if (updateProjectDto.status && updateProjectDto.status !== previousStatus) {
      const recipients = new Set<string>();
      if (updatedProject.ownerId !== userId) {
        recipients.add(updatedProject.ownerId);
      }
      updatedProject.members
        ?.filter((member) => member.id !== userId)
        .forEach((member) => recipients.add(member.id));

      await Promise.all(
        Array.from(recipients).map((recipientId) =>
          this.notificationService.createProjectStatusChangedNotification(
            updatedProject.id,
            updatedProject.name,
            updatedProject.status,
            userId,
            recipientId,
          ),
        ),
      );
    }

    return updatedProject;
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
