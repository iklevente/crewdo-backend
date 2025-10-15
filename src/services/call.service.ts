import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
  Inject,
} from '@nestjs/common';
import { Repository, DataSource } from 'typeorm';
import {
  Call,
  CallParticipant,
  User,
  Channel,
  CallStatus,
  CallType,
  ParticipantStatus,
} from '../entities/index';
import {
  StartCallDto,
  ScheduleCallDto,
  JoinCallDto,
  UpdateCallParticipantDto,
  CallResponseDto,
  CallType as DtoCallType,
  CallStatus as DtoCallStatus,
} from '../dto/call.dto';
import { NotificationService } from './notification.service';

@Injectable()
export class CallService {
  private callRepository: Repository<Call>;
  private callParticipantRepository: Repository<CallParticipant>;
  private userRepository: Repository<User>;
  private channelRepository: Repository<Channel>;

  constructor(
    @Inject('DATA_SOURCE')
    private dataSource: DataSource,
    private readonly notificationService: NotificationService,
  ) {
    this.callRepository = this.dataSource.getRepository(Call);
    this.callParticipantRepository =
      this.dataSource.getRepository(CallParticipant);
    this.userRepository = this.dataSource.getRepository(User);
    this.channelRepository = this.dataSource.getRepository(Channel);
  }

  private mapEntityStatusToDto(entityStatus: CallStatus): DtoCallStatus {
    switch (entityStatus) {
      case CallStatus.STARTING:
        return DtoCallStatus.SCHEDULED;
      case CallStatus.ACTIVE:
        return DtoCallStatus.ACTIVE;
      case CallStatus.ENDED:
        return DtoCallStatus.ENDED;
      case CallStatus.CANCELLED:
        return DtoCallStatus.CANCELLED;
      default:
        return DtoCallStatus.SCHEDULED;
    }
  }

  async startCall(
    startCallDto: StartCallDto,
    initiatorId: string,
  ): Promise<CallResponseDto> {
    const initiator = await this.userRepository.findOne({
      where: { id: initiatorId },
    });
    if (!initiator) {
      throw new NotFoundException('Initiator not found');
    }

    const channel = await this.channelRepository.findOne({
      where: { id: startCallDto.channelId },
      relations: ['members'],
    });

    if (!channel) {
      throw new NotFoundException('Channel not found');
    }

    // Check if user is member of channel
    const isMember = channel.members.some(
      (member) => member.id === initiatorId,
    );
    if (!isMember) {
      throw new ForbiddenException('Access denied to this channel');
    }

    // Check if there's already an active call in this channel
    const existingCall = await this.callRepository.findOne({
      where: {
        channel: { id: startCallDto.channelId },
        status: CallStatus.ACTIVE,
      },
    });

    if (existingCall) {
      throw new BadRequestException(
        'There is already an active call in this channel',
      );
    }

    const call = this.callRepository.create({
      title: startCallDto.title,
      type: startCallDto.type as CallType,
      status: CallStatus.ACTIVE,
      initiator,
      channel,
    });

    const savedCall = await this.callRepository.save(call);

    // Add initiator as participant
    const participant = this.callParticipantRepository.create({
      call: savedCall,
      user: initiator,
      status: ParticipantStatus.JOINED,
      isMuted: false,
      isVideoOff: startCallDto.type !== DtoCallType.VIDEO,
    });

    await this.callParticipantRepository.save(participant);

    // Invite specified users if provided
    if (startCallDto.invitedUserIds) {
      for (const userId of startCallDto.invitedUserIds) {
        const user = await this.userRepository.findOne({
          where: { id: userId },
        });
        if (user) {
          const invitedParticipant = this.callParticipantRepository.create({
            call: savedCall,
            user,
            status: ParticipantStatus.INVITED,
          });
          await this.callParticipantRepository.save(invitedParticipant);
        }
      }
    }

    // Send incoming call notifications to all channel members except initiator
    try {
      const otherMembers = channel.members.filter(
        (member) => member.id !== initiatorId,
      );
      for (const member of otherMembers) {
        await this.notificationService.createIncomingCallNotification(
          savedCall.id,
          savedCall.title,
          initiatorId,
          member.id,
        );
      }
    } catch (error) {
      console.warn('Failed to send incoming call notifications:', error);
    }

    return this.formatCallResponse(savedCall);
  }

  async scheduleCall(
    scheduleCallDto: ScheduleCallDto,
    initiatorId: string,
  ): Promise<CallResponseDto> {
    const initiator = await this.userRepository.findOne({
      where: { id: initiatorId },
    });
    if (!initiator) {
      throw new NotFoundException('Initiator not found');
    }

    const channel = await this.channelRepository.findOne({
      where: { id: scheduleCallDto.channelId },
      relations: ['members'],
    });

    if (!channel) {
      throw new NotFoundException('Channel not found');
    }

    // Check if user is member of channel
    const isMember = channel.members.some(
      (member) => member.id === initiatorId,
    );
    if (!isMember) {
      throw new ForbiddenException('Access denied to this channel');
    }

    const call = this.callRepository.create({
      title: scheduleCallDto.title,
      type: scheduleCallDto.type as CallType,
      status: CallStatus.STARTING, // Use starting for scheduled calls
      initiator,
      channel,
      settings: JSON.stringify({
        scheduled: true,
        scheduledStartTime: scheduleCallDto.scheduledStartTime,
        scheduledEndTime: scheduleCallDto.scheduledEndTime,
        description: scheduleCallDto.description,
      }),
    });

    const savedCall = await this.callRepository.save(call);

    // Invite specified users if provided
    if (scheduleCallDto.invitedUserIds) {
      for (const userId of scheduleCallDto.invitedUserIds) {
        const user = await this.userRepository.findOne({
          where: { id: userId },
        });
        if (user) {
          const invitedParticipant = this.callParticipantRepository.create({
            call: savedCall,
            user,
            status: ParticipantStatus.INVITED,
          });
          await this.callParticipantRepository.save(invitedParticipant);
        }
      }
    }

    // Send scheduled call notifications
    try {
      const scheduledTime = new Date(scheduleCallDto.scheduledStartTime);
      const notificationTargets =
        scheduleCallDto.invitedUserIds ||
        channel.members
          .filter((member) => member.id !== initiatorId)
          .map((member) => member.id);

      for (const targetUserId of notificationTargets) {
        await this.notificationService.createCallScheduledNotification(
          savedCall.id,
          savedCall.title,
          initiatorId,
          targetUserId,
          scheduledTime,
        );
      }
    } catch (error) {
      console.warn('Failed to send scheduled call notifications:', error);
    }

    return this.formatCallResponse(savedCall);
  }

  async joinCall(
    callId: string,
    joinCallDto: JoinCallDto,
    userId: string,
  ): Promise<void> {
    const call = await this.callRepository.findOne({
      where: { id: callId },
      relations: [
        'channel',
        'channel.members',
        'participants',
        'participants.user',
      ],
    });

    if (!call) {
      throw new NotFoundException('Call not found');
    }

    if (
      call.status !== CallStatus.ACTIVE &&
      call.status !== CallStatus.STARTING
    ) {
      throw new BadRequestException('Call is not active or available to join');
    }

    const user = await this.userRepository.findOne({ where: { id: userId } });
    if (!user) {
      throw new NotFoundException('User not found');
    }

    // Check if user is member of channel
    const isMember = call.channel.members.some(
      (member) => member.id === userId,
    );
    if (!isMember) {
      throw new ForbiddenException('Access denied to this call');
    }

    // Check if user is already a participant
    let participant = call.participants.find((p) => p.user.id === userId);

    if (participant) {
      if (participant.status === ParticipantStatus.JOINED) {
        throw new BadRequestException('User is already in the call');
      }
      // Update existing participant
      participant.status = ParticipantStatus.JOINED;
      participant.joinedAt = new Date();
      participant.isMuted = false;
      participant.isVideoOff = !(joinCallDto.withVideo || false);
    } else {
      // Create new participant
      participant = this.callParticipantRepository.create({
        call,
        user,
        status: ParticipantStatus.JOINED,
        isMuted: false,
        isVideoOff: !(joinCallDto.withVideo || false),
      });
    }

    await this.callParticipantRepository.save(participant);

    // If this is the first participant joining a scheduled call, mark it as active
    if (call.status === CallStatus.STARTING) {
      call.status = CallStatus.ACTIVE;
      await this.callRepository.save(call);
    }
  }

  async leaveCall(callId: string, userId: string): Promise<void> {
    const call = await this.callRepository.findOne({
      where: { id: callId },
      relations: ['participants', 'participants.user'],
    });

    if (!call) {
      throw new NotFoundException('Call not found');
    }

    const participant = call.participants.find((p) => p.user.id === userId);
    if (!participant) {
      throw new NotFoundException('User is not a participant in this call');
    }

    participant.status = ParticipantStatus.LEFT;
    participant.leftAt = new Date();
    await this.callParticipantRepository.save(participant);

    // Check if no active participants remain
    const activeParticipants = call.participants.filter(
      (p) => p.status === ParticipantStatus.JOINED,
    );
    if (activeParticipants.length === 0) {
      call.status = CallStatus.ENDED;
      call.endedAt = new Date();
      await this.callRepository.save(call);
    }
  }

  async updateParticipant(
    callId: string,
    userId: string,
    updateDto: UpdateCallParticipantDto,
  ): Promise<void> {
    const participant = await this.callParticipantRepository.findOne({
      where: {
        call: { id: callId },
        user: { id: userId },
      },
    });

    if (!participant) {
      throw new NotFoundException('Participant not found');
    }

    Object.assign(participant, updateDto);
    await this.callParticipantRepository.save(participant);
  }

  async findByChannel(
    channelId: string,
    userId: string,
  ): Promise<CallResponseDto[]> {
    const channel = await this.channelRepository.findOne({
      where: { id: channelId },
      relations: ['members'],
    });

    if (!channel) {
      throw new NotFoundException('Channel not found');
    }

    // Check if user is member of channel
    const isMember = channel.members.some((member) => member.id === userId);
    if (!isMember) {
      throw new ForbiddenException('Access denied to this channel');
    }

    const calls = await this.callRepository.find({
      where: { channel: { id: channelId } },
      relations: ['initiator', 'channel', 'participants', 'participants.user'],
      order: { startedAt: 'DESC' },
    });

    return calls.map((call) => this.formatCallResponse(call));
  }

  async findOne(id: string, userId: string): Promise<CallResponseDto> {
    const call = await this.callRepository.findOne({
      where: { id },
      relations: [
        'initiator',
        'channel',
        'channel.members',
        'participants',
        'participants.user',
      ],
    });

    if (!call) {
      throw new NotFoundException('Call not found');
    }

    // Check if user is member of channel
    const isMember = call.channel.members.some(
      (member) => member.id === userId,
    );
    if (!isMember) {
      throw new ForbiddenException('Access denied to this call');
    }

    return this.formatCallResponse(call);
  }

  async endCall(callId: string, userId: string): Promise<void> {
    const call = await this.callRepository.findOne({
      where: { id: callId },
      relations: ['initiator', 'participants'],
    });

    if (!call) {
      throw new NotFoundException('Call not found');
    }

    // Only initiator can end the call
    if (call.initiator.id !== userId) {
      throw new ForbiddenException('Only call initiator can end the call');
    }

    call.status = CallStatus.ENDED;
    call.endedAt = new Date();
    await this.callRepository.save(call);

    // Update all active participants to left
    const activeParticipants = call.participants.filter(
      (p) => p.status === ParticipantStatus.JOINED,
    );
    for (const participant of activeParticipants) {
      participant.status = ParticipantStatus.LEFT;
      participant.leftAt = new Date();
      await this.callParticipantRepository.save(participant);
    }
  }

  private formatCallResponse(call: Call): CallResponseDto {
    const duration =
      call.startedAt && call.endedAt
        ? Math.floor((call.endedAt.getTime() - call.startedAt.getTime()) / 1000)
        : undefined;

    interface CallSettings {
      description?: string;
      scheduledStartTime?: string | number;
      scheduledEndTime?: string | number;
    }

    const settings: CallSettings = call.settings
      ? (JSON.parse(call.settings) as CallSettings)
      : {};

    return {
      id: call.id,
      title: call.title,
      description: settings.description,
      type: call.type,
      status: this.mapEntityStatusToDto(call.status),
      createdAt: call.startedAt, // Use startedAt as createdAt
      updatedAt: call.updatedAt,
      startedAt: call.startedAt,
      endedAt: call.endedAt,
      scheduledStartTime: settings.scheduledStartTime
        ? new Date(settings.scheduledStartTime)
        : undefined,
      scheduledEndTime: settings.scheduledEndTime
        ? new Date(settings.scheduledEndTime)
        : undefined,
      initiator: {
        id: call.initiator.id,
        firstName: call.initiator.firstName,
        lastName: call.initiator.lastName,
      },
      channel: {
        id: call.channel.id,
        name: call.channel.name,
        type: call.channel.type,
      },
      participants:
        call.participants?.map((participant) => ({
          id: participant.id,
          user: {
            id: participant.user.id,
            firstName: participant.user.firstName,
            lastName: participant.user.lastName,
          },
          joinedAt: participant.joinedAt,
          leftAt: participant.leftAt,
          isMuted: participant.isMuted,
          isVideoEnabled: !participant.isVideoOff,
          isScreenSharing: false, // Would need to be tracked separately
          isHandRaised: false, // Would need to be tracked separately
          connectionQuality: 'good', // Would need to be tracked separately
        })) || [],
      duration,
      maxParticipants: call.participants?.length || 0,
    };
  }
}
