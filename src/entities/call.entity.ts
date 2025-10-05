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
import { Channel } from './channel.entity';
import { CallParticipant } from './call-participant.entity';

export enum CallType {
  VOICE = 'voice',
  VIDEO = 'video',
}

export enum CallStatus {
  STARTING = 'starting',
  ACTIVE = 'active',
  ENDED = 'ended',
  CANCELLED = 'cancelled',
}

@Entity('calls')
export class Call {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({
    type: 'varchar',
    length: 50,
    default: CallType.VOICE,
  })
  type: CallType;

  @Column({
    type: 'varchar',
    length: 50,
    default: CallStatus.STARTING,
  })
  status: CallStatus;

  @Column({ nullable: true })
  title: string;

  @Column({ default: false })
  isScreenSharing: boolean;

  @Column({ nullable: true })
  screenSharingUserId: string;

  @Column('text', { nullable: true })
  settings: string; // JSON string for call-specific settings like video quality, recording, etc.

  @CreateDateColumn()
  startedAt: Date;

  @Column({ nullable: true })
  endedAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  // Relations
  @ManyToOne(() => User)
  @JoinColumn({ name: 'initiatorId' })
  initiator: User;

  @Column('uuid')
  initiatorId: string;

  @ManyToOne(() => Channel, { nullable: true })
  @JoinColumn({ name: 'channelId' })
  channel: Channel;

  @Column('uuid', { nullable: true })
  channelId: string;

  @OneToMany(() => CallParticipant, (participant) => participant.call)
  participants: CallParticipant[];

  // For direct calls (DM)
  @ManyToMany(() => User)
  @JoinTable({
    name: 'call_invites',
    joinColumn: { name: 'callId', referencedColumnName: 'id' },
    inverseJoinColumn: { name: 'userId', referencedColumnName: 'id' },
  })
  invitedUsers: User[];
}
