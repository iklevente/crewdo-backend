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
import {
  CreateChannelDto,
  CreateDirectMessageDto,
  UpdateChannelDto,
  ChannelResponseDto,
} from '../dto/channel.dto';
import { ChannelService } from '../services/channel.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { UserRole } from '../entities';

interface AuthenticatedRequest {
  user: {
    id: string;
    email: string;
    role: string;
  };
}

@ApiTags('channels')
@Controller('channels')
@UseGuards(JwtAuthGuard, RolesGuard)
@ApiBearerAuth()
export class ChannelController {
  constructor(private readonly channelService: ChannelService) {}

  @Post()
  @ApiOperation({ summary: 'Create a new channel' })
  @ApiResponse({
    status: 201,
    description: 'Channel created successfully',
    type: ChannelResponseDto,
  })
  async create(
    @Body() createChannelDto: CreateChannelDto,
    @Request() req: AuthenticatedRequest,
  ): Promise<ChannelResponseDto> {
    return await this.channelService.create(createChannelDto, req.user.id);
  }

  @Post('dm')
  @ApiOperation({ summary: 'Create a direct message channel' })
  @ApiResponse({
    status: 201,
    description: 'DM channel created successfully',
    type: ChannelResponseDto,
  })
  async createDirectMessage(
    @Body() createDmDto: CreateDirectMessageDto,
    @Request() req: AuthenticatedRequest,
  ): Promise<ChannelResponseDto> {
    return await this.channelService.createDirectMessage(
      createDmDto,
      req.user.id,
    );
  }

  @Get('workspace/:workspaceId')
  @ApiOperation({ summary: 'Get channels by workspace' })
  @ApiParam({ name: 'workspaceId', description: 'Workspace ID' })
  @ApiResponse({
    status: 200,
    description: 'List of channels in workspace',
    type: [ChannelResponseDto],
  })
  async findByWorkspace(
    @Param('workspaceId') workspaceId: string,
    @Request() req: AuthenticatedRequest,
  ): Promise<ChannelResponseDto[]> {
    return await this.channelService.findByWorkspace(workspaceId, req.user.id);
  }

  @Get('dm')
  @ApiOperation({ summary: 'Get direct message channels for current user' })
  @ApiResponse({
    status: 200,
    description: 'List of DM channels',
    type: [ChannelResponseDto],
  })
  async findDirectMessages(
    @Request() req: AuthenticatedRequest,
  ): Promise<ChannelResponseDto[]> {
    return await this.channelService.findDirectMessages(req.user.id);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get channel by ID' })
  @ApiParam({ name: 'id', description: 'Channel ID' })
  @ApiResponse({
    status: 200,
    description: 'Channel details',
    type: ChannelResponseDto,
  })
  async findOne(
    @Param('id') id: string,
    @Request() req: AuthenticatedRequest,
  ): Promise<ChannelResponseDto> {
    return await this.channelService.findOne(id, req.user.id);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update channel' })
  @ApiParam({ name: 'id', description: 'Channel ID' })
  @ApiResponse({
    status: 200,
    description: 'Channel updated successfully',
    type: ChannelResponseDto,
  })
  async update(
    @Param('id') id: string,
    @Body() updateChannelDto: UpdateChannelDto,
    @Request() req: AuthenticatedRequest,
  ): Promise<ChannelResponseDto> {
    return await this.channelService.update(id, updateChannelDto, req.user.id);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete channel' })
  @ApiParam({ name: 'id', description: 'Channel ID' })
  @ApiResponse({ status: 204, description: 'Channel deleted successfully' })
  @HttpCode(HttpStatus.NO_CONTENT)
  @Roles(UserRole.ADMIN, UserRole.PROJECT_MANAGER)
  async remove(
    @Param('id') id: string,
    @Request() req: AuthenticatedRequest,
  ): Promise<void> {
    return await this.channelService.remove(id, req.user.id);
  }

  @Post(':id/members/:userId')
  @ApiOperation({
    summary: 'Add member to channel (Admin/Project Manager only)',
  })
  @ApiParam({ name: 'id', description: 'Channel ID' })
  @ApiParam({ name: 'userId', description: 'User ID to add' })
  @ApiResponse({ status: 201, description: 'Member added successfully' })
  @ApiResponse({
    status: 403,
    description: 'Forbidden - Admin or Project Manager role required',
  })
  @Roles(UserRole.ADMIN, UserRole.PROJECT_MANAGER)
  async addMember(
    @Param('id') id: string,
    @Param('userId') userId: string,
    @Request() req: AuthenticatedRequest,
  ): Promise<void> {
    return await this.channelService.addMember(id, userId, req.user.id);
  }

  @Delete(':id/members/:userId')
  @ApiOperation({
    summary: 'Remove member from channel (Admin/Project Manager only)',
  })
  @ApiParam({ name: 'id', description: 'Channel ID' })
  @ApiParam({ name: 'userId', description: 'User ID to remove' })
  @ApiResponse({ status: 204, description: 'Member removed successfully' })
  @ApiResponse({
    status: 403,
    description: 'Forbidden - Admin or Project Manager role required',
  })
  @HttpCode(HttpStatus.NO_CONTENT)
  @Roles(UserRole.ADMIN, UserRole.PROJECT_MANAGER)
  async removeMember(
    @Param('id') id: string,
    @Param('userId') userId: string,
    @Request() req: AuthenticatedRequest,
  ): Promise<void> {
    return await this.channelService.removeMember(id, userId, req.user.id);
  }
}
