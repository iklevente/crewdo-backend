import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  OneToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { User } from './user.entity';

export enum PresenceStatus {
  ONLINE = 'online',
  OFFLINE = 'offline',
  AWAY = 'away',
  BUSY = 'busy',
}

export enum PresenceSource {
  AUTO = 'auto',
  MANUAL = 'manual',
}

@Entity('user_presence')
export class UserPresence {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid', unique: true })
  userId: string;

  @OneToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'userId' })
  user: User;

  @Column({
    type: 'varchar',
    length: 20,
    default: PresenceStatus.OFFLINE,
  })
  status: PresenceStatus;

  @Column({
    type: 'varchar',
    length: 20,
    default: PresenceSource.AUTO,
  })
  statusSource: PresenceSource;

  @Column({ type: 'varchar', length: 20, nullable: true })
  manualStatus: PresenceStatus | null;

  @Column({ type: 'datetimeoffset', nullable: true })
  lastSeenAt: Date | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
