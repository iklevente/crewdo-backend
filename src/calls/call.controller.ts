import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  ParseUUIDPipe,
  UseGuards,
  Request,
  Query,
} from '@nestjs/common';
import {
  ApiTags,
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiParam,
} from '@nestjs/swagger';
import { CallService } from './call.service';
import { ChatGateway } from '../realtime/chat.gateway';
import {
  StartCallDto,
  ScheduleCallDto,
  JoinCallDto,
  UpdateCallParticipantDto,
  CallResponseDto,
  CallStatus,
  CallSessionResponseDto,
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
  constructor(
    private readonly callService: CallService,
    private readonly chatGateway: ChatGateway,
  ) {}

  @Get()
  @ApiOperation({ summary: 'List calls visible to the current user' })
  @ApiResponse({
    status: 200,
    description: 'Calls available to the authenticated user',
    type: [CallResponseDto],
  })
  async findAll(
    @Request() req: AuthenticatedRequest,
    @Query('status') status?: CallStatus,
  ): Promise<CallResponseDto[]> {
    return this.callService.findAllForUser(req.user.id, status);
  }

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
    const call = await this.callService.startCall(startCallDto, req.user.id);

    // Broadcast call update to all participants
    const participantIds =
      call.participants?.map((p) => p.user?.id).filter(Boolean) ?? [];
    this.chatGateway.publishCallUpdate(call, participantIds);

    return call;
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
    const call = await this.callService.scheduleCall(
      scheduleCallDto,
      req.user.id,
    );

    // Broadcast call update to all participants
    const participantIds =
      call.participants?.map((p) => p.user?.id).filter(Boolean) ?? [];
    this.chatGateway.publishCallUpdate(call, participantIds);

    return call;
  }

  @Post(':id/join')
  @ApiOperation({ summary: 'Join a call' })
  @ApiParam({ name: 'id', description: 'Call ID (UUID)' })
  @ApiResponse({ status: 200, description: 'Successfully joined call' })
  @ApiResponse({
    status: 403,
    description: 'Forbidden - No access to join this call',
  })
  async joinCall(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() joinCallDto: JoinCallDto,
    @Request() req: AuthenticatedRequest,
  ): Promise<void> {
    return this.callService.joinCall(id, joinCallDto, req.user.id);
  }

  @Post(':id/leave')
  @ApiOperation({ summary: 'Leave a call' })
  @ApiParam({ name: 'id', description: 'Call ID (UUID)' })
  @ApiResponse({ status: 200, description: 'Left call successfully' })
  @ApiResponse({
    status: 403,
    description: 'Forbidden - Not in this call or no access',
  })
  async leaveCall(
    @Param('id', ParseUUIDPipe) id: string,
    @Request() req: AuthenticatedRequest,
  ): Promise<void> {
    return this.callService.leaveCall(id, req.user.id);
  }

  @Post(':id/session')
  @ApiOperation({ summary: 'Generate media session credentials for LiveKit' })
  @ApiParam({ name: 'id', description: 'Call ID (UUID)' })
  @ApiResponse({
    status: 200,
    description: 'LiveKit connection details',
    type: CallSessionResponseDto,
  })
  async createSession(
    @Param('id', ParseUUIDPipe) id: string,
    @Request() req: AuthenticatedRequest,
  ): Promise<CallSessionResponseDto> {
    return this.callService.createSession(id, req.user.id);
  }

  @Post(':id/end')
  @ApiOperation({ summary: 'End a call (initiator only)' })
  @ApiParam({ name: 'id', description: 'Call ID (UUID)' })
  @ApiResponse({ status: 200, description: 'Call ended successfully' })
  @ApiResponse({
    status: 403,
    description: 'Forbidden - Only call initiator can end the call',
  })
  async endCall(
    @Param('id', ParseUUIDPipe) id: string,
    @Request() req: AuthenticatedRequest,
  ): Promise<void> {
    return this.callService.endCall(id, req.user.id);
  }

  @Patch(':id/participant')
  @ApiOperation({ summary: 'Update participant settings (mute/unmute)' })
  @ApiParam({ name: 'id', description: 'Call ID (UUID)' })
  @ApiResponse({ status: 200, description: 'Participant updated successfully' })
  async updateParticipant(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() updateDto: UpdateCallParticipantDto,
    @Request() req: AuthenticatedRequest,
  ): Promise<void> {
    return this.callService.updateParticipant(id, req.user.id, updateDto);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get call by ID' })
  @ApiParam({ name: 'id', description: 'Call ID (UUID)' })
  @ApiResponse({
    status: 200,
    description: 'Call details',
    type: CallResponseDto,
  })
  @ApiResponse({
    status: 403,
    description: 'Forbidden - No access to this call',
  })
  async findOne(
    @Param('id', ParseUUIDPipe) id: string,
    @Request() req: AuthenticatedRequest,
  ): Promise<CallResponseDto> {
    return this.callService.findOne(id, req.user.id);
  }
}
