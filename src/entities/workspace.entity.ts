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

export enum WorkspaceType {
  COMPANY = 'company',
  TEAM = 'team',
  PROJECT = 'project',
  COMMUNITY = 'community',
}

@Entity('workspaces')
export class Workspace {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'nvarchar', length: 255 })
  name: string;

  @Column({ type: 'nvarchar', length: 'MAX', nullable: true })
  description: string;

  @Column({
    type: 'varchar',
    length: 50,
    default: WorkspaceType.TEAM,
  })
  type: WorkspaceType;

  @Column({ default: false })
  isPublic: boolean;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  // Relations
  @ManyToOne(() => User)
  @JoinColumn({ name: 'ownerId' })
  owner: User;

  @Column('uuid')
  ownerId: string;

  @ManyToMany(() => User)
  @JoinTable({
    name: 'workspace_members',
    joinColumn: { name: 'workspaceId', referencedColumnName: 'id' },
    inverseJoinColumn: { name: 'userId', referencedColumnName: 'id' },
  })
  members: User[];

  @OneToMany('Channel', 'workspace')
  channels: any[];

  @OneToMany('Project', 'workspace', {
    nullable: true,
  })
  projects: any[];
}
