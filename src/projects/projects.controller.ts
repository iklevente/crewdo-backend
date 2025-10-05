import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  UseGuards,
  ParseUUIDPipe,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
} from '@nestjs/swagger';
import { ProjectsService } from './projects.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import {
  CreateProjectDto,
  UpdateProjectDto,
  AddProjectMembersDto,
  ProjectResponseDto,
} from '../dto/project.dto';
import { User } from '../entities';

@ApiTags('Projects')
@Controller('projects')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class ProjectsController {
  constructor(private readonly projectsService: ProjectsService) {}

  @ApiOperation({ summary: 'Create a new project' })
  @ApiResponse({
    status: 201,
    description: 'Project created successfully',
    type: ProjectResponseDto,
  })
  @Post()
  async create(
    @Body() createProjectDto: CreateProjectDto,
    @CurrentUser() user: User,
  ) {
    return await this.projectsService.create(createProjectDto, user.id);
  }

  @ApiOperation({ summary: 'Get all projects accessible to the current user' })
  @ApiResponse({
    status: 200,
    description: 'Projects retrieved successfully',
    type: [ProjectResponseDto],
  })
  @Get()
  async findAll(@CurrentUser() user: User) {
    return await this.projectsService.findAll(user.id, user.role);
  }

  @ApiOperation({ summary: 'Get project by ID' })
  @ApiResponse({
    status: 200,
    description: 'Project retrieved successfully',
    type: ProjectResponseDto,
  })
  @ApiResponse({
    status: 404,
    description: 'Project not found or access denied',
  })
  @Get(':id')
  async findOne(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: User,
  ) {
    return await this.projectsService.findOne(id, user.id, user.role);
  }

  @ApiOperation({ summary: 'Update project' })
  @ApiResponse({
    status: 200,
    description: 'Project updated successfully',
    type: ProjectResponseDto,
  })
  @ApiResponse({
    status: 403,
    description: 'Forbidden - insufficient permissions',
  })
  @ApiResponse({ status: 404, description: 'Project not found' })
  @Patch(':id')
  async update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() updateProjectDto: UpdateProjectDto,
    @CurrentUser() user: User,
  ) {
    return await this.projectsService.update(
      id,
      updateProjectDto,
      user.id,
      user.role,
    );
  }

  @ApiOperation({ summary: 'Delete project' })
  @ApiResponse({ status: 200, description: 'Project deleted successfully' })
  @ApiResponse({
    status: 403,
    description: 'Forbidden - insufficient permissions',
  })
  @ApiResponse({ status: 404, description: 'Project not found' })
  @Delete(':id')
  async remove(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: User,
  ) {
    await this.projectsService.remove(id, user.id, user.role);
    return { message: 'Project deleted successfully' };
  }

  @ApiOperation({ summary: 'Add members to project' })
  @ApiResponse({
    status: 200,
    description: 'Members added successfully',
    type: ProjectResponseDto,
  })
  @ApiResponse({
    status: 403,
    description: 'Forbidden - insufficient permissions',
  })
  @ApiResponse({ status: 404, description: 'Project or users not found' })
  @Patch(':id/members')
  async addMembers(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() addMembersDto: AddProjectMembersDto,
    @CurrentUser() user: User,
  ) {
    return await this.projectsService.addMembers(
      id,
      addMembersDto,
      user.id,
      user.role,
    );
  }

  @ApiOperation({ summary: 'Remove member from project' })
  @ApiResponse({
    status: 200,
    description: 'Member removed successfully',
    type: ProjectResponseDto,
  })
  @ApiResponse({
    status: 403,
    description: 'Forbidden - insufficient permissions',
  })
  @ApiResponse({ status: 404, description: 'Project not found' })
  @Delete(':id/members/:memberId')
  async removeMember(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('memberId', ParseUUIDPipe) memberId: string,
    @CurrentUser() user: User,
  ) {
    return await this.projectsService.removeMember(
      id,
      memberId,
      user.id,
      user.role,
    );
  }
}
