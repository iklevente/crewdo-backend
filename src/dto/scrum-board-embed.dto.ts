import {
  IsString,
  IsOptional,
  IsUUID,
  IsObject,
  IsEnum,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export enum ScrumBoardEmbedType {
  SPRINT_BOARD = 'sprint_board',
  TASK_DETAIL = 'task_detail',
  PROJECT_OVERVIEW = 'project_overview',
  BURNDOWN_CHART = 'burndown_chart',
}

export class CreateScrumBoardEmbedDto {
  @ApiProperty({ example: 'message-uuid-here' })
  @IsUUID()
  messageId: string;

  @ApiProperty({
    enum: ScrumBoardEmbedType,
    example: ScrumBoardEmbedType.SPRINT_BOARD,
  })
  @IsEnum(ScrumBoardEmbedType)
  embedType: ScrumBoardEmbedType;

  @ApiPropertyOptional({ example: 'Current Sprint Board' })
  @IsOptional()
  @IsString()
  title?: string;

  @ApiPropertyOptional({ example: 'View and manage current sprint tasks' })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiProperty({
    example: {
      projectId: 'project-uuid',
      sprintId: 'sprint-uuid',
      boardId: 'board-uuid',
      filters: { status: 'in_progress' },
    },
  })
  @IsObject()
  embedData: {
    projectId?: string;
    sprintId?: string;
    boardId?: string;
    taskId?: string;
    filters?: {
      status?: string;
      assignee?: string;
      priority?: string;
      [key: string]: any;
    };
    settings?: {
      showBurndown?: boolean;
      showVelocity?: boolean;
      autoRefresh?: boolean;
      [key: string]: any;
    };
  };
}

export class UpdateScrumBoardEmbedDto {
  @ApiPropertyOptional({ example: 'Updated Sprint Board' })
  @IsOptional()
  @IsString()
  title?: string;

  @ApiPropertyOptional({ example: 'Updated description' })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsObject()
  embedData?: {
    projectId?: string;
    sprintId?: string;
    boardId?: string;
    taskId?: string;
    filters?: {
      status?: string;
      assignee?: string;
      priority?: string;
      [key: string]: any;
    };
    settings?: {
      showBurndown?: boolean;
      showVelocity?: boolean;
      autoRefresh?: boolean;
      [key: string]: any;
    };
  };
}

export class ScrumBoardEmbedResponseDto {
  @ApiProperty()
  id: string;

  @ApiProperty({ enum: ScrumBoardEmbedType })
  embedType: ScrumBoardEmbedType;

  @ApiPropertyOptional()
  title?: string;

  @ApiPropertyOptional()
  description?: string;

  @ApiProperty()
  embedData: {
    projectId?: string;
    sprintId?: string;
    boardId?: string;
    taskId?: string;
    filters?: any;
    settings?: any;
  };

  @ApiProperty()
  isActive: boolean;

  @ApiProperty()
  createdAt: Date;

  @ApiProperty()
  updatedAt: Date;

  @ApiProperty()
  message: {
    id: string;
    content: string;
    author: {
      id: string;
      firstName: string;
      lastName: string;
    };
    channel: {
      id: string;
      name: string;
    };
  };

  @ApiProperty()
  creator: {
    id: string;
    firstName: string;
    lastName: string;
  };

  // Dynamic data populated from the project management system
  @ApiPropertyOptional()
  projectData?: {
    id: string;
    name: string;
    description?: string;
    status: string;
  };

  @ApiPropertyOptional()
  sprintData?: {
    id: string;
    name: string;
    startDate: Date;
    endDate: Date;
    status: string;
    tasks: Array<{
      id: string;
      title: string;
      status: string;
      priority: string;
      assignee?: {
        id: string;
        firstName: string;
        lastName: string;
      };
      storyPoints?: number;
    }>;
  };

  @ApiPropertyOptional()
  taskData?: {
    id: string;
    title: string;
    description?: string;
    status: string;
    priority: string;
    assignee?: {
      id: string;
      firstName: string;
      lastName: string;
    };
    storyPoints?: number;
    comments: Array<{
      id: string;
      content: string;
      author: {
        id: string;
        firstName: string;
        lastName: string;
      };
      createdAt: Date;
    }>;
  };

  @ApiPropertyOptional()
  chartData?: {
    burndownChart?: {
      dates: string[];
      idealBurndown: number[];
      actualBurndown: number[];
    };
    velocityChart?: {
      sprints: string[];
      completedPoints: number[];
      plannedPoints: number[];
    };
  };
}

export class ScrumBoardInteractionDto {
  @ApiProperty({ example: 'embed-uuid-here' })
  @IsUUID()
  embedId: string;

  @ApiProperty({ example: 'task_status_change' })
  @IsString()
  action:
    | 'task_status_change'
    | 'task_assign'
    | 'task_comment'
    | 'sprint_update'
    | 'board_filter';

  @ApiProperty()
  @IsObject()
  data: {
    taskId?: string;
    newStatus?: string;
    assigneeId?: string;
    comment?: string;
    filters?: any;
    [key: string]: any;
  };
}
