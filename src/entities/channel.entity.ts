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

export enum ChannelType {
  TEXT = 'text',
  VOICE = 'voice',
  DM = 'dm',
  GROUP_DM = 'group_dm',
  PROJECT = 'project', // Integrated with project/scrum board
}

export enum ChannelVisibility {
  PUBLIC = 'public',
  PRIVATE = 'private',
}

@Entity('channels')
export class Channel {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  name: string;

  @Column('text', { nullable: true })
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

  @Column({ nullable: true })
  topic: string;

  @Column({ default: false })
  isArchived: boolean;

  @Column({ default: false })
  isThread: boolean;

  @Column('uuid', { nullable: true })
  parentChannelId: string; // For threads

  @Column('text', { nullable: true })
  settings: string; // JSON string for channel-specific settings like notifications, permissions

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  // Relations
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

  // For project-integrated channels
  @ManyToOne(() => Project, { nullable: true })
  @JoinColumn({ name: 'projectId' })
  project: Project;

  @Column('uuid', { nullable: true })
  projectId: string;

  @OneToMany(() => Channel, (channel) => channel.parentChannel)
  threads: Channel[];

  @ManyToOne(() => Channel, (channel) => channel.threads, { nullable: true })
  @JoinColumn({ name: 'parentChannelId' })
  parentChannel: Channel;

  // Workspace relationship
  @ManyToOne('Workspace', { nullable: true })
  @JoinColumn({ name: 'workspaceId' })
  workspace: any;

  @Column('uuid', { nullable: true })
  workspaceId: string;
}
