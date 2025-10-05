import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { User } from './user.entity';
import { Channel } from './channel.entity';
import { Project } from './project.entity';

export enum ScrumBoardEmbedType {
  SPRINT_BOARD = 'sprint_board',
  BACKLOG = 'backlog',
  BURNDOWN_CHART = 'burndown_chart',
  TASK_DETAIL = 'task_detail',
}

@Entity('scrum_board_embeds')
export class ScrumBoardEmbed {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  title: string;

  @Column({
    type: 'varchar',
    length: 50,
    default: ScrumBoardEmbedType.SPRINT_BOARD,
  })
  type: ScrumBoardEmbedType;

  @Column('text')
  boardState: string; // JSON string for the actual scrum board data

  @Column('text', { nullable: true })
  metadata: string; // JSON string for additional metadata about the embed

  @Column({ default: true })
  isInteractive: boolean; // Whether users can interact with the board

  @Column({ default: false })
  isLocked: boolean; // Whether the board state is locked

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  // Relations
  @ManyToOne(() => User)
  @JoinColumn({ name: 'createdById' })
  createdBy: User;

  @Column('uuid')
  createdById: string;

  @ManyToOne(() => Channel)
  @JoinColumn({ name: 'channelId' })
  channel: Channel;

  @Column('uuid')
  channelId: string;

  @ManyToOne(() => Project)
  @JoinColumn({ name: 'projectId' })
  project: Project;

  @Column('uuid')
  projectId: string;

  // Optional: Link to specific message that contains this embed
  @Column('uuid', { nullable: true })
  messageId: string;
}
