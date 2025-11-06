import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { User } from './user.entity';
import { Call } from './call.entity';

export enum ParticipantStatus {
  INVITED = 'invited',
  JOINED = 'joined',
  LEFT = 'left',
}

@Entity('call_participants')
export class CallParticipant {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({
    type: 'varchar',
    length: 50,
    default: ParticipantStatus.INVITED,
  })
  status: ParticipantStatus;

  @Column({ default: false })
  isMuted: boolean;

  @Column({ default: false })
  isVideoOff: boolean;

  @CreateDateColumn()
  joinedAt: Date;

  @Column({ nullable: true })
  leftAt: Date;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'userId' })
  user: User;

  @Column('uuid')
  userId: string;

  @ManyToOne(() => Call, (call) => call.participants, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'callId' })
  call: Call;

  @Column('uuid')
  callId: string;
}
