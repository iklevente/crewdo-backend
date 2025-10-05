import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  Inject,
} from '@nestjs/common';
import { Repository, DataSource } from 'typeorm';
import { Comment, Task, UserRole } from '../entities';
import { CreateCommentDto, UpdateCommentDto } from '../dto/comment.dto';

@Injectable()
export class CommentsService {
  private commentRepository: Repository<Comment>;
  private taskRepository: Repository<Task>;

  constructor(
    @Inject('DATA_SOURCE')
    private dataSource: DataSource,
  ) {
    this.commentRepository = this.dataSource.getRepository(Comment);
    this.taskRepository = this.dataSource.getRepository(Task);
  }

  async create(
    createCommentDto: CreateCommentDto,
    authorId: string,
  ): Promise<Comment> {
    // Check if task exists and user has access
    const task = await this.taskRepository
      .createQueryBuilder('task')
      .leftJoinAndSelect('task.project', 'project')
      .leftJoinAndSelect('project.members', 'members')
      .where('task.id = :taskId', { taskId: createCommentDto.taskId })
      .getOne();

    if (!task) {
      throw new NotFoundException('Task not found');
    }

    // Check if user has access to the project
    const hasAccess =
      task.project.ownerId === authorId ||
      task.project.members.some((member) => member.id === authorId);
    if (!hasAccess) {
      throw new ForbiddenException('Access denied to this task');
    }

    const comment = this.commentRepository.create({
      content: createCommentDto.content,
      taskId: createCommentDto.taskId,
      authorId,
    });

    return await this.commentRepository.save(comment);
  }

  async findByTaskId(
    taskId: string,
    userId: string,
    userRole: UserRole,
  ): Promise<Comment[]> {
    // First check if user has access to the task
    const task = await this.taskRepository
      .createQueryBuilder('task')
      .leftJoinAndSelect('task.project', 'project')
      .leftJoinAndSelect('project.members', 'members')
      .where('task.id = :taskId', { taskId })
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

    return await this.commentRepository
      .createQueryBuilder('comment')
      .leftJoinAndSelect('comment.author', 'author')
      .leftJoinAndSelect('comment.task', 'task')
      .where('comment.taskId = :taskId', { taskId })
      .orderBy('comment.createdAt', 'ASC')
      .getMany();
  }

  async findOne(
    id: string,
    userId: string,
    userRole: UserRole,
  ): Promise<Comment> {
    const comment = await this.commentRepository
      .createQueryBuilder('comment')
      .leftJoinAndSelect('comment.author', 'author')
      .leftJoinAndSelect('comment.task', 'task')
      .leftJoinAndSelect('task.project', 'project')
      .leftJoinAndSelect('project.members', 'members')
      .where('comment.id = :id', { id })
      .getOne();

    if (!comment) {
      throw new NotFoundException('Comment not found');
    }

    // Check if user has access to the project
    if (userRole !== UserRole.ADMIN) {
      const hasAccess =
        comment.task.project.ownerId === userId ||
        comment.task.project.members.some((member) => member.id === userId);
      if (!hasAccess) {
        throw new ForbiddenException('Access denied to this comment');
      }
    }

    return comment;
  }

  async update(
    id: string,
    updateCommentDto: UpdateCommentDto,
    userId: string,
    userRole: UserRole,
  ): Promise<Comment> {
    const comment = await this.findOne(id, userId, userRole);

    // Only comment author and admins can edit comments
    if (comment.authorId !== userId && userRole !== UserRole.ADMIN) {
      throw new ForbiddenException('You can only edit your own comments');
    }

    await this.commentRepository.update(id, {
      content: updateCommentDto.content,
      isEdited: true,
    });

    return await this.findOne(id, userId, userRole);
  }

  async remove(id: string, userId: string, userRole: UserRole): Promise<void> {
    const comment = await this.findOne(id, userId, userRole);

    // Only comment author, project owner, and admins can delete comments
    const canDelete =
      comment.authorId === userId ||
      comment.task.project.ownerId === userId ||
      userRole === UserRole.ADMIN;

    if (!canDelete) {
      throw new ForbiddenException(
        'You can only delete your own comments or comments in your projects',
      );
    }

    await this.commentRepository.delete(id);
  }
}
