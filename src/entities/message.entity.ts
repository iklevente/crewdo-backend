import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  OneToMany,
  JoinColumn,
} from 'typeorm';
import { User } from './user.entity';
import { Channel } from './channel.entity';
import { MessageReaction } from './message-reaction.entity';
import { Attachment } from './attachment.entity';

export enum MessageType {
  TEXT = 'text',
  IMAGE = 'image',
  FILE = 'file',
  VOICE = 'voice',
  VIDEO = 'video',
  SYSTEM = 'system',
  SCRUM_BOARD = 'scrum_board', // Special message type for scrum board embeds
  CALL_START = 'call_start',
  CALL_END = 'call_end',
}

@Entity('messages')
export class Message {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column('text')
  content: string;

  @Column({
    type: 'varchar',
    length: 50,
    default: MessageType.TEXT,
  })
  type: MessageType;

  @Column({ default: false })
  isEdited: boolean;

  @Column({ default: false })
  isDeleted: boolean;

  @Column({ default: false })
  isPinned: boolean;

  @Column('text', { nullable: true })
  metadata: string; // JSON string for storing additional data like scrum board state, call info, etc.

  @Column('text', { nullable: true })
  mentions: string; // JSON string of user IDs mentioned in the message

  @Column('uuid', { nullable: true })
  replyToId: string; // For message threading/replies

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  // Relations
  @ManyToOne(() => User)
  @JoinColumn({ name: 'authorId' })
  author: User;

  @Column('uuid')
  authorId: string;

  @ManyToOne(() => Channel, (channel) => channel.messages)
  @JoinColumn({ name: 'channelId' })
  channel: Channel;

  @Column('uuid')
  channelId: string;

  @ManyToOne(() => Message, { nullable: true })
  @JoinColumn({ name: 'replyToId' })
  replyTo: Message | null;

  @OneToMany(() => MessageReaction, 'message')
  reactions: MessageReaction[];

  @OneToMany(() => Attachment, 'message', {
    nullable: true,
  })
  attachments: Attachment[];
}
