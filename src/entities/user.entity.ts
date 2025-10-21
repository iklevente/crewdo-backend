import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  OneToMany,
  ManyToMany,
} from 'typeorm';
import { Exclude } from 'class-transformer';
import { Project } from './project.entity';
import { Task } from './task.entity';
import { Comment } from './comment.entity';

export enum UserRole {
  ADMIN = 'admin',
  PROJECT_MANAGER = 'project_manager',
  TEAM_MEMBER = 'team_member',
  CLIENT = 'client',
}

export enum UserStatus {
  ACTIVE = 'active',
  INACTIVE = 'inactive',
}

@Entity('users')
export class User {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ unique: true, type: 'nvarchar', length: 320 })
  email: string;

  @Column({ type: 'nvarchar', length: 120 })
  firstName: string;

  @Column({ type: 'nvarchar', length: 120 })
  lastName: string;

  @Column({ type: 'nvarchar', length: 255 })
  @Exclude()
  password: string;

  @Column({
    type: 'varchar',
    length: 50,
    default: UserRole.TEAM_MEMBER,
  })
  role: UserRole;

  @Column({
    type: 'varchar',
    length: 50,
    default: UserStatus.ACTIVE,
  })
  status: UserStatus;

  @Column({ nullable: true, type: 'nvarchar', length: 512 })
  profilePicture: string;

  @Column({ nullable: true, type: 'nvarchar', length: 32 })
  phoneNumber: string;

  @Column({ nullable: true, type: 'nvarchar', length: 120 })
  department: string;

  @Column({ nullable: true, type: 'nvarchar', length: 120 })
  position: string;

  @Column({ default: false })
  isEmailVerified: boolean;

  @Column({ nullable: true })
  lastLoginAt: Date;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  // Relations
  @OneToMany(() => Project, (project) => project.owner)
  ownedProjects: Project[];

  @ManyToMany(() => Project, (project) => project.members)
  projects: Project[];

  @OneToMany(() => Task, (task) => task.assignee)
  assignedTasks: Task[];

  @OneToMany(() => Task, (task) => task.creator)
  createdTasks: Task[];

  @OneToMany(() => Comment, (comment) => comment.author)
  comments: Comment[];
}
