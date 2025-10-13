import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  UseGuards,
  Query,
  ParseUUIDPipe,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiQuery,
} from '@nestjs/swagger';
import { TasksService } from './tasks.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { CreateTaskDto, UpdateTaskDto, TaskResponseDto } from '../dto/task.dto';
import { User } from '../entities';

@ApiTags('Tasks')
@Controller('tasks')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class TasksController {
  constructor(private readonly tasksService: TasksService) {}

  @ApiOperation({ summary: 'Create a new task' })
  @ApiResponse({
    status: 201,
    description: 'Task created successfully',
    type: TaskResponseDto,
  })
  @ApiResponse({
    status: 404,
    description: 'Project not found or access denied',
  })
  @Post()
  async create(
    @Body() createTaskDto: CreateTaskDto,
    @CurrentUser() user: User,
  ) {
    return await this.tasksService.create(createTaskDto, user.id);
  }

  @ApiOperation({ summary: 'Get all tasks accessible to the current user' })
  @ApiQuery({
    name: 'projectId',
    required: false,
    description: 'Filter tasks by project ID',
  })
  @ApiResponse({
    status: 200,
    description: 'Tasks retrieved successfully',
    type: [TaskResponseDto],
  })
  @Get()
  async findAll(
    @CurrentUser() user: User,
    @Query('projectId', new ParseUUIDPipe({ optional: true }))
    projectId?: string,
  ) {
    return await this.tasksService.findAll(user.id, user.role, projectId);
  }

  @ApiOperation({ summary: "Get current user's assigned and created tasks" })
  @ApiResponse({
    status: 200,
    description: 'My tasks retrieved successfully',
    type: [TaskResponseDto],
  })
  @Get('my-tasks')
  async findMyTasks(@CurrentUser() user: User) {
    return await this.tasksService.findMyTasks(user.id);
  }

  @ApiOperation({ summary: 'Get task by ID' })
  @ApiResponse({
    status: 200,
    description: 'Task retrieved successfully',
    type: TaskResponseDto,
  })
  @ApiResponse({ status: 404, description: 'Task not found' })
  @ApiResponse({ status: 403, description: 'Access denied to this task' })
  @Get(':id')
  async findOne(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: User,
  ) {
    return await this.tasksService.findOne(id, user.id, user.role);
  }

  @ApiOperation({ summary: 'Update task' })
  @ApiResponse({
    status: 200,
    description: 'Task updated successfully',
    type: TaskResponseDto,
  })
  @ApiResponse({ status: 404, description: 'Task not found' })
  @ApiResponse({ status: 403, description: 'Access denied' })
  @Patch(':id')
  async update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() updateTaskDto: UpdateTaskDto,
    @CurrentUser() user: User,
  ) {
    return await this.tasksService.update(
      id,
      updateTaskDto,
      user.id,
      user.role,
    );
  }

  @ApiOperation({ summary: 'Update task position for ordering' })
  @ApiResponse({
    status: 200,
    description: 'Task position updated successfully',
    type: TaskResponseDto,
  })
  @Patch(':id/position')
  async updatePosition(
    @Param('id', ParseUUIDPipe) id: string,
    @Body('position') position: number,
    @CurrentUser() user: User,
  ) {
    return await this.tasksService.updateTaskPosition(
      id,
      position,
      user.id,
      user.role,
    );
  }

  @ApiOperation({ summary: 'Delete task' })
  @ApiResponse({ status: 200, description: 'Task deleted successfully' })
  @ApiResponse({ status: 404, description: 'Task not found' })
  @ApiResponse({ status: 403, description: 'Insufficient permissions' })
  @Delete(':id')
  async remove(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: User,
  ) {
    await this.tasksService.remove(id, user.id, user.role);
    return { message: 'Task deleted successfully' };
  }
}
