import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { User } from './user.entity';

export enum NotificationType {
  TASK_ASSIGNED = 'task_assigned',
  TASK_COMPLETED = 'task_completed',
  TASK_OVERDUE = 'task_overdue',
  PROJECT_INVITATION = 'project_invitation',
  COMMENT_ADDED = 'comment_added',
  DEADLINE_APPROACHING = 'deadline_approaching',
  PROJECT_STATUS_CHANGED = 'project_status_changed',
}

@Entity('notifications')
export class Notification {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  title: string;

  @Column('text')
  message: string;

  @Column({
    type: 'varchar',
    length: 100,
  })
  type: NotificationType;

  @Column({ default: false })
  isRead: boolean;

  @Column('uuid', { nullable: true })
  relatedEntityId: string; // ID of task, project, etc.

  @Column({ nullable: true })
  relatedEntityType: string; // 'task', 'project', etc.

  @CreateDateColumn()
  createdAt: Date;

  // Relations
  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'userId' })
  user: User;

  @Column('uuid')
  userId: string;
}
