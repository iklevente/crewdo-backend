import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  Inject,
} from '@nestjs/common';
import { Repository, DataSource } from 'typeorm';
import { Task, Project, User, UserRole } from '../entities';
import { CreateTaskDto, UpdateTaskDto } from '../dto/task.dto';

@Injectable()
export class TasksService {
  private taskRepository: Repository<Task>;
  private projectRepository: Repository<Project>;
  private userRepository: Repository<User>;

  constructor(
    @Inject('DATA_SOURCE')
    private dataSource: DataSource,
  ) {
    this.taskRepository = this.dataSource.getRepository(Task);
    this.projectRepository = this.dataSource.getRepository(Project);
    this.userRepository = this.dataSource.getRepository(User);
  }

  async create(createTaskDto: CreateTaskDto, creatorId: string): Promise<Task> {
    // Check if project exists and user has access
    const project = await this.projectRepository
      .createQueryBuilder('project')
      .leftJoinAndSelect('project.members', 'members')
      .where('project.id = :projectId', { projectId: createTaskDto.projectId })
      .andWhere('(project.ownerId = :creatorId OR members.id = :creatorId)', {
        creatorId,
      })
      .getOne();

    if (!project) {
      throw new NotFoundException('Project not found or access denied');
    }

    // Check if assignee exists and has access to project (if provided)
    if (createTaskDto.assigneeId) {
      const assignee = await this.userRepository.findOne({
        where: { id: createTaskDto.assigneeId },
      });
      if (!assignee) {
        throw new NotFoundException('Assignee not found');
      }

      // Check if assignee has access to the project
      const hasAccess =
        project.ownerId === assignee.id ||
        project.members.some((member) => member.id === assignee.id);
      if (!hasAccess) {
        throw new ForbiddenException(
          'Assignee does not have access to this project',
        );
      }
    }

    const taskData = {
      title: createTaskDto.title,
      description: createTaskDto.description,
      projectId: createTaskDto.projectId,
      status: createTaskDto.status,
      priority: createTaskDto.priority,
      dueDate: createTaskDto.dueDate
        ? new Date(createTaskDto.dueDate)
        : undefined,
      estimatedHours: createTaskDto.estimatedHours,
      tags: createTaskDto.tags ? JSON.stringify(createTaskDto.tags) : undefined,
      position: createTaskDto.position,
      creatorId,
      assigneeId: createTaskDto.assigneeId || undefined,
    };

    const task = this.taskRepository.create(taskData);
    return await this.taskRepository.save(task);
  }

  async findAll(
    userId: string,
    userRole: UserRole,
    projectId?: string,
  ): Promise<Task[]> {
    const queryBuilder = this.taskRepository
      .createQueryBuilder('task')
      .leftJoinAndSelect('task.project', 'project')
      .leftJoinAndSelect('project.members', 'projectMembers')
      .leftJoinAndSelect('task.assignee', 'assignee')
      .leftJoinAndSelect('task.creator', 'creator')
      .loadRelationCountAndMap('task.commentCount', 'task.comments');

    // Filter by project if provided
    if (projectId) {
      queryBuilder.andWhere('task.projectId = :projectId', { projectId });
    }

    // If user is not admin, only show tasks from projects they have access to
    if (userRole !== UserRole.ADMIN) {
      queryBuilder.andWhere(
        '(project.ownerId = :userId OR projectMembers.id = :userId)',
        { userId },
      );
    }

    return await queryBuilder.getMany();
  }

  async findOne(id: string, userId: string, userRole: UserRole): Promise<Task> {
    const task = await this.taskRepository
      .createQueryBuilder('task')
      .leftJoinAndSelect('task.project', 'project')
      .leftJoinAndSelect('project.members', 'projectMembers')
      .leftJoinAndSelect('task.assignee', 'assignee')
      .leftJoinAndSelect('task.creator', 'creator')
      .loadRelationCountAndMap('task.commentCount', 'task.comments')
      .where('task.id = :id', { id })
      .getOne();

    if (!task) {
      throw new NotFoundException('Task not found');
    }

    // Check if user has access to the project
    if (userRole !== UserRole.ADMIN) {
      const hasAccess =
        task.project.ownerId === userId ||
        task.project.members.some((member) => member.id === userId);
      if (!hasAccess) {
        throw new ForbiddenException('Access denied to this task');
      }
    }

    return task;
  }

  async update(
    id: string,
    updateTaskDto: UpdateTaskDto,
    userId: string,
    userRole: UserRole,
  ): Promise<Task> {
    const task = await this.findOne(id, userId, userRole);

    // Check if assignee exists and has access to project (if being updated)
    if (updateTaskDto.assigneeId) {
      const assignee = await this.userRepository.findOne({
        where: { id: updateTaskDto.assigneeId },
      });
      if (!assignee) {
        throw new NotFoundException('Assignee not found');
      }

      // Check if assignee has access to the project
      const hasAccess =
        task.project.ownerId === assignee.id ||
        task.project.members.some((member) => member.id === assignee.id);
      if (!hasAccess) {
        throw new ForbiddenException(
          'Assignee does not have access to this project',
        );
      }
    }

    const updateData = {
      ...updateTaskDto,
      tags: updateTaskDto.tags
        ? JSON.stringify(updateTaskDto.tags)
        : updateTaskDto.tags,
    };
    await this.taskRepository.update(id, updateData);
    return await this.findOne(id, userId, userRole);
  }

  async remove(id: string, userId: string, userRole: UserRole): Promise<void> {
    const task = await this.findOne(id, userId, userRole);

    // Only task creator, project owner, project managers, and admins can delete tasks
    const canDelete =
      task.creatorId === userId ||
      task.project.ownerId === userId ||
      userRole === UserRole.ADMIN ||
      userRole === UserRole.PROJECT_MANAGER;

    if (!canDelete) {
      throw new ForbiddenException(
        'You can only delete your own tasks or tasks in your projects',
      );
    }

    await this.taskRepository.delete(id);
  }

  async findMyTasks(userId: string): Promise<Task[]> {
    return await this.taskRepository
      .createQueryBuilder('task')
      .leftJoinAndSelect('task.project', 'project')
      .leftJoinAndSelect('task.assignee', 'assignee')
      .leftJoinAndSelect('task.creator', 'creator')
      .loadRelationCountAndMap('task.commentCount', 'task.comments')
      .where('task.assigneeId = :userId OR task.creatorId = :userId', {
        userId,
      })
      .orderBy('task.createdAt', 'DESC')
      .getMany();
  }

  async updateTaskPosition(
    id: string,
    position: number,
    userId: string,
    userRole: UserRole,
  ): Promise<Task> {
    // Verify task exists and user has access
    await this.findOne(id, userId, userRole);
    await this.taskRepository.update(id, { position });
    return await this.findOne(id, userId, userRole);
  }
}
