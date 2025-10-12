import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  UseGuards,
  Request,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import {
  ApiTags,
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiParam,
} from '@nestjs/swagger';
import { WorkspaceService } from '../services/workspace.service';
import {
  CreateWorkspaceDto,
  UpdateWorkspaceDto,
  WorkspaceResponseDto,
} from '../dto/workspace.dto';

interface AuthenticatedRequest {
  user: {
    id: string;
    email: string;
    role: string;
  };
}
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

@ApiTags('workspaces')
@Controller('workspaces')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class WorkspaceController {
  constructor(private readonly workspaceService: WorkspaceService) {}

  @Post()
  @ApiOperation({ summary: 'Create a new workspace' })
  @ApiResponse({
    status: 201,
    description: 'Workspace created successfully',
    type: WorkspaceResponseDto,
  })
  async create(
    @Body() createWorkspaceDto: CreateWorkspaceDto,
    @Request() req: AuthenticatedRequest,
  ): Promise<WorkspaceResponseDto> {
    return this.workspaceService.create(createWorkspaceDto, req.user.id);
  }

  @Get()
  @ApiOperation({ summary: 'Get all workspaces for the current user' })
  @ApiResponse({
    status: 200,
    description: 'List of workspaces',
    type: [WorkspaceResponseDto],
  })
  async findAll(
    @Request() req: AuthenticatedRequest,
  ): Promise<WorkspaceResponseDto[]> {
    return this.workspaceService.findAll(req.user.id);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get workspace by ID' })
  @ApiParam({ name: 'id', description: 'Workspace ID' })
  @ApiResponse({
    status: 200,
    description: 'Workspace details',
    type: WorkspaceResponseDto,
  })
  async findOne(
    @Param('id') id: string,
    @Request() req: AuthenticatedRequest,
  ): Promise<WorkspaceResponseDto> {
    return this.workspaceService.findOne(id, req.user.id);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update workspace' })
  @ApiParam({ name: 'id', description: 'Workspace ID' })
  @ApiResponse({
    status: 200,
    description: 'Workspace updated successfully',
    type: WorkspaceResponseDto,
  })
  async update(
    @Param('id') id: string,
    @Body() updateWorkspaceDto: UpdateWorkspaceDto,
    @Request() req: AuthenticatedRequest,
  ): Promise<WorkspaceResponseDto> {
    return this.workspaceService.update(id, updateWorkspaceDto, req.user.id);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete workspace' })
  @ApiParam({ name: 'id', description: 'Workspace ID' })
  @ApiResponse({ status: 204, description: 'Workspace deleted successfully' })
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(
    @Param('id') id: string,
    @Request() req: AuthenticatedRequest,
  ): Promise<void> {
    return this.workspaceService.remove(id, req.user.id);
  }

  @Post(':id/members/:email')
  @ApiOperation({ summary: 'Add member to workspace' })
  @ApiParam({ name: 'id', description: 'Workspace ID' })
  @ApiParam({ name: 'email', description: 'User email to add' })
  @ApiResponse({ status: 201, description: 'Member added successfully' })
  async addMember(
    @Param('id') id: string,
    @Param('email') email: string,
    @Request() req: AuthenticatedRequest,
  ): Promise<void> {
    return this.workspaceService.addMember(id, email, req.user.id);
  }

  @Delete(':id/members/:userId')
  @ApiOperation({ summary: 'Remove member from workspace' })
  @ApiParam({ name: 'id', description: 'Workspace ID' })
  @ApiParam({ name: 'userId', description: 'User ID to remove' })
  @ApiResponse({ status: 204, description: 'Member removed successfully' })
  @HttpCode(HttpStatus.NO_CONTENT)
  async removeMember(
    @Param('id') id: string,
    @Param('userId') userId: string,
    @Request() req: AuthenticatedRequest,
  ): Promise<void> {
    return this.workspaceService.removeMember(id, userId, req.user.id);
  }

  @Get(':id/members')
  @ApiOperation({ summary: 'Get workspace members' })
  @ApiParam({ name: 'id', description: 'Workspace ID' })
  @ApiResponse({ status: 200, description: 'List of workspace members' })
  async getMembers(
    @Param('id') id: string,
    @Request() req: AuthenticatedRequest,
  ) {
    return this.workspaceService.getMembers(id, req.user.id);
  }
}
