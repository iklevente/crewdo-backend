import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  OneToOne,
  JoinColumn,
} from 'typeorm';
import { User } from './user.entity';

export enum UserPresenceStatus {
  ONLINE = 'online',
  AWAY = 'away',
  BUSY = 'busy',
  OFFLINE = 'offline',
  INVISIBLE = 'invisible',
}

export enum UserActivity {
  TYPING = 'typing',
  IN_CALL = 'in_call',
  SCREEN_SHARING = 'screen_sharing',
  IN_MEETING = 'in_meeting',
  CODING = 'coding',
  REVIEWING = 'reviewing',
}

@Entity('user_presence')
export class UserPresence {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({
    type: 'varchar',
    length: 50,
    default: UserPresenceStatus.OFFLINE,
  })
  status: UserPresenceStatus;

  @Column({ nullable: true })
  customStatus: string;

  @Column({
    type: 'varchar',
    length: 50,
    nullable: true,
  })
  activity: UserActivity;

  @Column('text', { nullable: true })
  customData: string | null; // JSON string for additional presence data

  @Column({ nullable: true })
  lastSeenAt: Date;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  // Relations
  @OneToOne(() => User, 'presence')
  @JoinColumn({ name: 'userId' })
  user: User;

  @Column('uuid')
  userId: string;
}
