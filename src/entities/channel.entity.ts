import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  OneToMany,
  ManyToMany,
  JoinTable,
  JoinColumn,
} from 'typeorm';
import { User } from './user.entity';
import { Message } from './message.entity';
import { Project } from './project.entity';
import { Workspace } from './workspace.entity';

export enum ChannelType {
  TEXT = 'text',
  DM = 'dm',
  GROUP_DM = 'group_dm',
}

export enum ChannelVisibility {
  PUBLIC = 'public',
  PRIVATE = 'private',
}

@Entity('channels')
export class Channel {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'nvarchar', length: 255 })
  name: string;

  @Column({ type: 'nvarchar', length: 'MAX', nullable: true })
  description: string;

  @Column({
    type: 'varchar',
    length: 50,
    default: ChannelType.TEXT,
  })
  type: ChannelType;

  @Column({
    type: 'varchar',
    length: 50,
    default: ChannelVisibility.PUBLIC,
  })
  visibility: ChannelVisibility;

  @Column({ type: 'nvarchar', length: 255, nullable: true })
  topic: string;

  @Column({ default: false })
  isArchived: boolean;

  @Column({ type: 'nvarchar', length: 'MAX', nullable: true })
  settings: string; // JSON string for channel-specific settings like notifications, permissions

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  @ManyToOne(() => User, { nullable: true })
  @JoinColumn({ name: 'creatorId' })
  creator: User;

  @Column('uuid', { nullable: true })
  creatorId: string;

  @ManyToMany(() => User)
  @JoinTable({
    name: 'channel_members',
    joinColumn: { name: 'channelId', referencedColumnName: 'id' },
    inverseJoinColumn: { name: 'userId', referencedColumnName: 'id' },
  })
  members: User[];

  @OneToMany(() => Message, (message) => message.channel)
  messages: Message[];

  @ManyToOne(() => Project, { nullable: true })
  @JoinColumn({ name: 'projectId' })
  project: Project;

  @Column('uuid', { nullable: true })
  projectId: string | null;

  @ManyToOne(() => Workspace, { nullable: true })
  @JoinColumn({ name: 'workspaceId' })
  workspace: Workspace;

  @Column('uuid', { nullable: true })
  workspaceId: string;
}
