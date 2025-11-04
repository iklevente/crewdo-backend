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
  COMMENT_ADDED = 'comment_added',
  PROJECT_STATUS_CHANGED = 'project_status_changed',
  MESSAGE_RECEIVED = 'message_received',
  MESSAGE_REPLY = 'message_reply',
  CALL_SCHEDULED = 'call_scheduled',
  INCOMING_CALL = 'incoming_call',
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

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'userId' })
  user: User;

  @Column('uuid')
  userId: string;
}
