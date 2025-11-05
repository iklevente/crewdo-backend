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
  TEXT = 'TEXT',
  SYSTEM = 'SYSTEM',
}

@Entity('messages')
export class Message {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'nvarchar', length: 'MAX' })
  content: string;

  @Column({
    type: 'simple-enum',
    enum: MessageType,
    default: MessageType.TEXT,
  })
  type: MessageType;

  @Column({ default: false })
  isEdited: boolean;

  @Column({ default: false })
  isDeleted: boolean;

  @Column('uuid', { nullable: true })
  replyToId: string; // For message threading/replies

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

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
