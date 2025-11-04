import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { User } from './user.entity';
import { Task } from './task.entity';
import { Project } from './project.entity';
import { Message } from './message.entity';

export enum AttachmentType {
  DOCUMENT = 'document',
  IMAGE = 'image',
  VIDEO = 'video',
  AUDIO = 'audio',
  OTHER = 'other',
}

@Entity('attachments')
export class Attachment {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  originalName: string;

  @Column()
  fileName: string;

  @Column()
  filePath: string;

  @Column()
  mimeType: string;

  @Column('bigint')
  fileSize: number;

  @Column({
    type: 'varchar',
    length: 50,
  })
  type: AttachmentType;

  @CreateDateColumn()
  uploadedAt: Date;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'uploadedById' })
  uploadedBy: User;

  @Column('uuid')
  uploadedById: string;

  // Can be attached to task, project, or message
  @ManyToOne(() => Task, { nullable: true, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'taskId' })
  task: Task;

  @Column('uuid', { nullable: true })
  taskId: string;

  @ManyToOne(() => Project, { nullable: true, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'projectId' })
  project: Project;

  @Column('uuid', { nullable: true })
  projectId: string;

  // Add message relationship
  @ManyToOne(() => Message, (message) => message.attachments, {
    nullable: true,
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'messageId' })
  message: Message;

  @Column('uuid', { nullable: true })
  messageId: string;
}
