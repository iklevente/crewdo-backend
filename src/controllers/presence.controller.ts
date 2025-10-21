import {
  Body,
  Controller,
  Delete,
  Get,
  Patch,
  Request,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PresenceService } from '../services/presence.service';
import {
  ManualPresenceUpdateDto,
  PresenceResponseDto,
} from '../dto/presence.dto';
import { ChatGateway } from '../websocket/chat.gateway';

interface AuthenticatedRequest {
  user: {
    id: string;
  };
}

@ApiTags('presence')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('presence')
export class PresenceController {
  constructor(
    private readonly presenceService: PresenceService,
    private readonly chatGateway: ChatGateway,
  ) {}

  @Get()
  @ApiOperation({ summary: 'Get presence information for all users' })
  @ApiResponse({
    status: 200,
    description: 'Presence snapshot',
    type: [PresenceResponseDto],
  })
  async findAll(): Promise<PresenceResponseDto[]> {
    return this.presenceService.getAllPresence();
  }

  @Get('me')
  @ApiOperation({ summary: 'Get presence for current user' })
  @ApiResponse({
    status: 200,
    description: 'Current user presence entry',
    type: PresenceResponseDto,
  })
  async findMine(
    @Request() req: AuthenticatedRequest,
  ): Promise<PresenceResponseDto> {
    return this.presenceService.getPresenceForUser(req.user.id);
  }

  @Patch('me/manual')
  @ApiOperation({ summary: 'Set a manual presence status for current user' })
  @ApiResponse({
    status: 200,
    description: 'Manual presence applied',
    type: PresenceResponseDto,
  })
  async setManualPresence(
    @Request() req: AuthenticatedRequest,
    @Body() payload: ManualPresenceUpdateDto,
  ): Promise<PresenceResponseDto> {
    const presence = await this.presenceService.setManualStatus(
      req.user.id,
      payload.status,
    );

    this.chatGateway.publishPresenceUpdate(presence);
    return presence;
  }

  @Delete('me/manual')
  @ApiOperation({
    summary: 'Clear manual presence status and revert to automatic updates',
  })
  @ApiResponse({
    status: 200,
    description: 'Manual presence cleared',
    type: PresenceResponseDto,
  })
  async clearManualPresence(
    @Request() req: AuthenticatedRequest,
  ): Promise<PresenceResponseDto> {
    const isOnline = this.chatGateway.isUserOnline(req.user.id);
    const presence = await this.presenceService.clearManualStatus(
      req.user.id,
      isOnline,
    );

    this.chatGateway.publishPresenceUpdate(presence);
    return presence;
  }
}
