import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  UseGuards,
  Request,
} from '@nestjs/common';
import {
  ApiTags,
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiParam,
} from '@nestjs/swagger';
import { CallService } from '../services/call.service';
import {
  StartCallDto,
  ScheduleCallDto,
  JoinCallDto,
  UpdateCallParticipantDto,
  CallResponseDto,
} from '../dto/call.dto';

interface AuthenticatedRequest {
  user: {
    id: string;
    email: string;
    role: string;
  };
}
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

@ApiTags('calls')
@Controller('calls')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class CallController {
  constructor(private readonly callService: CallService) {}

  @Post('start')
  @ApiOperation({ summary: 'Start a new call' })
  @ApiResponse({
    status: 201,
    description: 'Call started successfully',
    type: CallResponseDto,
  })
  async startCall(
    @Body() startCallDto: StartCallDto,
    @Request() req: AuthenticatedRequest,
  ): Promise<CallResponseDto> {
    return this.callService.startCall(startCallDto, req.user.id);
  }

  @Post('schedule')
  @ApiOperation({ summary: 'Schedule a call' })
  @ApiResponse({
    status: 201,
    description: 'Call scheduled successfully',
    type: CallResponseDto,
  })
  async scheduleCall(
    @Body() scheduleCallDto: ScheduleCallDto,
    @Request() req: AuthenticatedRequest,
  ): Promise<CallResponseDto> {
    return this.callService.scheduleCall(scheduleCallDto, req.user.id);
  }

  @Post(':id/join')
  @ApiOperation({ summary: 'Join a call' })
  @ApiParam({ name: 'id', description: 'Call ID' })
  @ApiResponse({ status: 200, description: 'Joined call successfully' })
  async joinCall(
    @Param('id') id: string,
    @Body() joinCallDto: JoinCallDto,
    @Request() req: AuthenticatedRequest,
  ): Promise<void> {
    return this.callService.joinCall(id, joinCallDto, req.user.id);
  }

  @Post(':id/leave')
  @ApiOperation({ summary: 'Leave a call' })
  @ApiParam({ name: 'id', description: 'Call ID' })
  @ApiResponse({ status: 200, description: 'Left call successfully' })
  async leaveCall(
    @Param('id') id: string,
    @Request() req: AuthenticatedRequest,
  ): Promise<void> {
    return this.callService.leaveCall(id, req.user.id);
  }

  @Post(':id/end')
  @ApiOperation({ summary: 'End a call (initiator only)' })
  @ApiParam({ name: 'id', description: 'Call ID' })
  @ApiResponse({ status: 200, description: 'Call ended successfully' })
  async endCall(
    @Param('id') id: string,
    @Request() req: AuthenticatedRequest,
  ): Promise<void> {
    return this.callService.endCall(id, req.user.id);
  }

  @Patch(':id/participant')
  @ApiOperation({ summary: 'Update call participant settings' })
  @ApiParam({ name: 'id', description: 'Call ID' })
  @ApiResponse({ status: 200, description: 'Participant updated successfully' })
  async updateParticipant(
    @Param('id') id: string,
    @Body() updateDto: UpdateCallParticipantDto,
    @Request() req: AuthenticatedRequest,
  ): Promise<void> {
    return this.callService.updateParticipant(id, req.user.id, updateDto);
  }

  @Get('channel/:channelId')
  @ApiOperation({ summary: 'Get calls by channel' })
  @ApiParam({ name: 'channelId', description: 'Channel ID' })
  @ApiResponse({
    status: 200,
    description: 'List of calls in channel',
    type: [CallResponseDto],
  })
  async findByChannel(
    @Param('channelId') channelId: string,
    @Request() req: AuthenticatedRequest,
  ): Promise<CallResponseDto[]> {
    return this.callService.findByChannel(channelId, req.user.id);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get call by ID' })
  @ApiParam({ name: 'id', description: 'Call ID' })
  @ApiResponse({
    status: 200,
    description: 'Call details',
    type: CallResponseDto,
  })
  async findOne(
    @Param('id') id: string,
    @Request() req: AuthenticatedRequest,
  ): Promise<CallResponseDto> {
    return this.callService.findOne(id, req.user.id);
  }
}
