import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
  Inject,
  Logger,
  OnModuleInit,
} from '@nestjs/common';
import { Repository, DataSource, In } from 'typeorm';
import {
  Call,
  CallParticipant,
  User,
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
  CallSessionResponseDto,
} from '../dto/call.dto';
import { NotificationService } from './notification.service';
import { LivekitService } from './livekit.service';
import { ChatGateway } from '../websocket/chat.gateway';

interface CallSettings {
  description?: string;
  scheduledStartTime?: string | number | null;
  scheduledEndTime?: string | number | null;
  roomName?: string;
}

@Injectable()
export class CallService implements OnModuleInit {
  private readonly logger = new Logger(CallService.name);
  private callRepository: Repository<Call>;
  private callParticipantRepository: Repository<CallParticipant>;
  private userRepository: Repository<User>;
  private isScheduledSweepRunning = false;

  constructor(
    @Inject('DATA_SOURCE')
    private dataSource: DataSource,
    private readonly notificationService: NotificationService,
    private readonly livekitService: LivekitService,
    private readonly chatGateway: ChatGateway,
  ) {
    this.callRepository = this.dataSource.getRepository(Call);
    this.callParticipantRepository =
      this.dataSource.getRepository(CallParticipant);
    this.userRepository = this.dataSource.getRepository(User);
  }

  onModuleInit() {
    void this.reconcileScheduledCalls();

    // Check for scheduled call transitions every 30 seconds
    setInterval(() => {
      void this.reconcileScheduledCalls();
    }, 30_000);
  }

  private parseCallSettings(settings?: string | null): CallSettings {
    if (!settings) {
      return {};
    }

    try {
      return JSON.parse(settings) as CallSettings;
    } catch (error) {
      this.logger.warn(`Failed to parse call settings: ${error}`);
      return {};
    }
  }

  private async persistCallSettings(
    call: Call,
    patch: Partial<CallSettings>,
  ): Promise<Call> {
    const currentSettings = this.parseCallSettings(call.settings);
    const nextSettings: CallSettings = {
      ...currentSettings,
      ...patch,
    };

    call.settings = JSON.stringify(nextSettings);
    return this.callRepository.save(call);
  }

  private getCallRoomName(call: Call): string {
    const settings = this.parseCallSettings(call.settings);
    return settings.roomName || call.id;
  }

  private async ensureLivekitRoom(call: Call): Promise<void> {
    if (!this.livekitService.isEnabled) {
      return;
    }

    const roomName = this.getCallRoomName(call);
    try {
      await this.livekitService.ensureRoom(roomName);
    } catch (error) {
      this.logger.error(
        `Failed to ensure LiveKit room for call ${call.id}: ${error}`,
      );
      throw error instanceof Error
        ? error
        : new Error('Failed to prepare call media room');
    }
  }

  private buildDisplayName(user: User | undefined | null): string {
    if (!user) {
      return 'Crewdo user';
    }

    const name = `${user.firstName ?? ''} ${user.lastName ?? ''}`.trim();
    if (name.length > 0) {
      return name;
    }

    return user.email ?? 'Crewdo user';
  }

  private resolveVideoPreference(
    explicitPreference: boolean | undefined,
    callType: CallType,
  ): boolean {
    if (typeof explicitPreference === 'boolean') {
      return explicitPreference;
    }
    return callType === CallType.VIDEO;
  }

  private resolveAudioPreference(
    explicitPreference: boolean | undefined,
  ): boolean {
    if (typeof explicitPreference === 'boolean') {
      return explicitPreference;
    }
    return true;
  }

  private collectCallRecipients(call: Call): Set<string> {
    const recipients = new Set<string>();

    if (call.initiator?.id) {
      recipients.add(call.initiator.id);
    }

    call.participants?.forEach((participant) => {
      const userId = participant.user?.id;
      if (userId) {
        recipients.add(userId);
      }
    });

    call.invitedUsers?.forEach((user) => {
      if (user?.id) {
        recipients.add(user.id);
      }
    });

    return recipients;
  }

  private async getCallSnapshot(callId: string): Promise<Call | null> {
    return this.callRepository.findOne({
      where: { id: callId },
      relations: [
        'initiator',
        'participants',
        'participants.user',
        'invitedUsers',
      ],
    });
  }

  private async ensureCallRelations(call: Call): Promise<Call> {
    const hasParticipants = Array.isArray(call.participants)
      ? call.participants.every((participant) => Boolean(participant.user))
      : false;
    const hasInvitedUsers = Array.isArray(call.invitedUsers);

    if (call.initiator && hasParticipants && hasInvitedUsers) {
      return call;
    }

    const snapshot = await this.getCallSnapshot(call.id);
    return snapshot ?? call;
  }

  private async emitCallUpdate(call: Call): Promise<void> {
    try {
      const hydratedCall = await this.ensureCallRelations(call);
      const payload = this.formatCallResponse(hydratedCall);
      const recipients = this.collectCallRecipients(hydratedCall);

      if (recipients.size > 0) {
        this.logger.log(
          `Emitting call_updated for call ${call.id} to ${recipients.size} recipients: ${Array.from(recipients).join(', ')}`,
        );
        this.chatGateway.publishCallUpdate(payload, recipients);
      } else {
        this.logger.warn(`No recipients found for call ${call.id}`);
      }
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : String(error ?? 'unknown error');
      this.logger.warn(`Failed to emit call update: ${message}`);
    }
  }

  private async reconcileScheduledCalls(): Promise<void> {
    if (this.isScheduledSweepRunning) {
      return;
    }

    this.isScheduledSweepRunning = true;

    try {
      const candidates = await this.callRepository
        .createQueryBuilder('call')
        .leftJoinAndSelect('call.initiator', 'initiator')
        .leftJoinAndSelect('call.participants', 'participants')
        .leftJoinAndSelect('participants.user', 'participantUser')
        .leftJoinAndSelect('call.invitedUsers', 'invitedUsers')
        .where('call.status IN (:...statuses)', {
          statuses: [CallStatus.SCHEDULED, CallStatus.ACTIVE],
        })
        .getMany();

      for (const call of candidates) {
        await this.applyScheduledTransitions(call);
      }
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : String(error ?? 'unknown error');
      this.logger.warn(`Scheduled call reconciliation failed: ${message}`);
    } finally {
      this.isScheduledSweepRunning = false;
    }
  }

  private async applyScheduledTransitions(call: Call): Promise<Call> {
    const originalStatus = call.status;
    const settings = this.parseCallSettings(call.settings);
    const now = new Date();
    let shouldPersistCall = false;

    const scheduledStart = settings.scheduledStartTime
      ? new Date(settings.scheduledStartTime)
      : null;
    const scheduledEnd = settings.scheduledEndTime
      ? new Date(settings.scheduledEndTime)
      : null;

    if (
      call.status === CallStatus.SCHEDULED &&
      scheduledStart &&
      !Number.isNaN(scheduledStart.getTime()) &&
      now >= scheduledStart
    ) {
      call.status = CallStatus.ACTIVE;
      call.startedAt = call.startedAt ?? scheduledStart;
      shouldPersistCall = true;
    }

    const shouldEndCall =
      (call.status === CallStatus.SCHEDULED ||
        call.status === CallStatus.ACTIVE) &&
      scheduledEnd &&
      !Number.isNaN(scheduledEnd.getTime()) &&
      now >= scheduledEnd;

    if (shouldEndCall) {
      call.status = CallStatus.ENDED;
      call.endedAt = call.endedAt ?? scheduledEnd ?? now;
      shouldPersistCall = true;

      if (call.participants?.length) {
        const updatedParticipants = call.participants.filter(
          (participant) => participant.status === ParticipantStatus.JOINED,
        );
        for (const participant of updatedParticipants) {
          participant.status = ParticipantStatus.LEFT;
          participant.leftAt = participant.leftAt ?? call.endedAt ?? now;
        }
        if (updatedParticipants.length > 0) {
          await this.callParticipantRepository.save(updatedParticipants);
        }
      }
    }

    if (shouldPersistCall) {
      await this.callRepository.save(call);

      if (call.status !== originalStatus) {
        await this.emitCallUpdate(call);
      }
    }

    return call;
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

    const invitedUserIds = Array.from(
      new Set(
        (startCallDto.invitedUserIds || []).filter(
          (userId) => userId !== initiatorId,
        ),
      ),
    );

    const invitedUsers = invitedUserIds.length
      ? await this.userRepository.find({ where: { id: In(invitedUserIds) } })
      : [];

    const desiredVideo = this.resolveVideoPreference(
      startCallDto.withVideo,
      startCallDto.type,
    );
    const desiredAudio = this.resolveAudioPreference(startCallDto.withAudio);

    const call = this.callRepository.create({
      title: startCallDto.title,
      type: startCallDto.type,
      status: CallStatus.ACTIVE,
      initiator,
      invitedUsers,
    });

    const savedCall = await this.callRepository.save(call);
    const callWithSettings = await this.persistCallSettings(savedCall, {
      roomName: savedCall.id,
    });

    await this.callParticipantRepository.save(
      this.callParticipantRepository.create({
        call: callWithSettings,
        user: initiator,
        status: ParticipantStatus.JOINED,
        isMuted: !desiredAudio,
        isVideoOff: !desiredVideo,
      }),
    );

    for (const user of invitedUsers) {
      const invitedParticipant = this.callParticipantRepository.create({
        call: callWithSettings,
        user,
        status: ParticipantStatus.INVITED,
      });
      await this.callParticipantRepository.save(invitedParticipant);
    }

    try {
      for (const user of invitedUsers) {
        await this.notificationService.createIncomingCallNotification(
          callWithSettings.id,
          callWithSettings.title,
          initiatorId,
          user.id,
        );
      }
    } catch (error) {
      console.warn('Failed to send incoming call notifications:', error);
    }

    await this.ensureLivekitRoom(callWithSettings);

    const hydratedCall = await this.getCallWithRelations(callWithSettings.id);
    const callResponse = this.formatCallResponse(hydratedCall);

    await this.emitCallUpdate(hydratedCall);

    // Send incoming_call event to each invited user
    try {
      for (const user of invitedUsers) {
        this.chatGateway.publishIncomingCall(callResponse, user.id);
      }
    } catch (error) {
      this.logger.warn('Failed to send incoming call WebSocket events:', error);
    }

    return callResponse;
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

    const invitedUserIds = Array.from(
      new Set(
        (scheduleCallDto.invitedUserIds || []).filter(
          (userId) => userId !== initiatorId,
        ),
      ),
    );

    const invitedUsers = invitedUserIds.length
      ? await this.userRepository.find({ where: { id: In(invitedUserIds) } })
      : [];

    const call = this.callRepository.create({
      title: scheduleCallDto.title,
      type: scheduleCallDto.type,
      status: CallStatus.SCHEDULED,
      initiator,
      invitedUsers,
    });

    const savedCall = await this.callRepository.save(call);

    const callWithSettings = await this.persistCallSettings(savedCall, {
      description: scheduleCallDto.description,
      scheduledStartTime: scheduleCallDto.scheduledStartTime,
      scheduledEndTime: scheduleCallDto.scheduledEndTime,
      roomName: savedCall.id,
    });

    for (const user of invitedUsers) {
      const invitedParticipant = this.callParticipantRepository.create({
        call: callWithSettings,
        user,
        status: ParticipantStatus.INVITED,
      });
      await this.callParticipantRepository.save(invitedParticipant);
    }

    try {
      const scheduledTime = new Date(scheduleCallDto.scheduledStartTime);
      for (const user of invitedUsers) {
        await this.notificationService.createCallScheduledNotification(
          callWithSettings.id,
          callWithSettings.title,
          initiatorId,
          user.id,
          scheduledTime,
        );
      }
    } catch (error) {
      console.warn('Failed to send scheduled call notifications:', error);
    }

    await this.ensureLivekitRoom(callWithSettings);

    const hydratedCall = await this.getCallWithRelations(callWithSettings.id);
    await this.emitCallUpdate(hydratedCall);
    return this.formatCallResponse(hydratedCall);
  }

  async joinCall(
    callId: string,
    joinCallDto: JoinCallDto,
    userId: string,
  ): Promise<void> {
    let call = await this.callRepository.findOne({
      where: { id: callId },
      relations: ['initiator', 'participants', 'participants.user'],
    });

    if (!call) {
      throw new NotFoundException('Call not found');
    }

    call = await this.applyScheduledTransitions(call);

    const currentSettings = this.parseCallSettings(call.settings);
    if (!currentSettings.roomName) {
      call = await this.persistCallSettings(call, { roomName: call.id });
    }

    if (call.status === CallStatus.SCHEDULED) {
      throw new BadRequestException(
        'This call has not started yet. Please wait for the scheduled start time.',
      );
    }

    if (call.status !== CallStatus.ACTIVE) {
      throw new BadRequestException('Call is not active or available to join');
    }

    const user = await this.userRepository.findOne({ where: { id: userId } });
    if (!user) {
      throw new NotFoundException('User not found');
    }

    const isInitiator = call.initiator.id === userId;
    const desiredVideo = this.resolveVideoPreference(
      joinCallDto.withVideo,
      call.type,
    );
    const desiredAudio = this.resolveAudioPreference(joinCallDto.withAudio);

    // Check if user is already a participant
    let participant = call.participants.find((p) => p.user.id === userId);

    if (participant) {
      if (participant.status === ParticipantStatus.JOINED) {
        throw new BadRequestException('User is already in the call');
      }
      // Update existing participant
      participant.status = ParticipantStatus.JOINED;
      participant.joinedAt = new Date();
      participant.isMuted = !desiredAudio;
      participant.isVideoOff = !desiredVideo;
    } else {
      if (!isInitiator) {
        throw new ForbiddenException('User is not invited to this call');
      }

      // Create new participant for initiator (scheduled calls)
      participant = this.callParticipantRepository.create({
        call,
        user,
        status: ParticipantStatus.JOINED,
        isMuted: !desiredAudio,
        isVideoOff: !desiredVideo,
      });
    }

    await this.callParticipantRepository.save(participant);

    await this.ensureLivekitRoom(call);

    const snapshot = await this.getCallSnapshot(call.id);
    if (snapshot) {
      await this.emitCallUpdate(snapshot);
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

    const snapshot = await this.getCallSnapshot(callId);
    if (snapshot) {
      await this.emitCallUpdate(snapshot);
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
      relations: ['call', 'call.participants'],
    });

    if (!participant) {
      throw new NotFoundException('Participant not found');
    }

    if (typeof updateDto.isMuted === 'boolean') {
      participant.isMuted = updateDto.isMuted;
    }

    if (typeof updateDto.isVideoEnabled === 'boolean') {
      participant.isVideoOff = !updateDto.isVideoEnabled;
    }

    if (typeof updateDto.isScreenSharing === 'boolean') {
      const call = participant.call;
      if (updateDto.isScreenSharing) {
        call.isScreenSharing = true;
        call.screenSharingUserId = userId;
      } else if (call.screenSharingUserId === userId) {
        call.isScreenSharing = false;
        call.screenSharingUserId = null;
      }
      await this.callRepository.save(call);
    }

    await this.callParticipantRepository.save(participant);

    const snapshot = await this.getCallSnapshot(callId);
    if (snapshot) {
      await this.emitCallUpdate(snapshot);
    }
  }

  private async getCallWithRelations(callId: string): Promise<Call> {
    const call = await this.getCallSnapshot(callId);

    if (!call) {
      throw new NotFoundException('Call not found');
    }

    return this.applyScheduledTransitions(call);
  }

  async findOne(id: string, userId: string): Promise<CallResponseDto> {
    let call = await this.callRepository.findOne({
      where: { id },
      relations: ['initiator', 'participants', 'participants.user'],
    });

    if (!call) {
      throw new NotFoundException('Call not found');
    }

    call = await this.applyScheduledTransitions(call);

    const isInitiator = call.initiator.id === userId;
    const isParticipant = call.participants.some(
      (participant) => participant.user.id === userId,
    );

    if (!isInitiator && !isParticipant) {
      throw new ForbiddenException('Access denied to this call');
    }

    return this.formatCallResponse(call);
  }

  async findAllForUser(
    userId: string,
    status?: CallStatus,
  ): Promise<CallResponseDto[]> {
    await this.reconcileScheduledCalls();

    const queryBuilder = this.callRepository
      .createQueryBuilder('call')
      .leftJoinAndSelect('call.initiator', 'initiator')
      .leftJoinAndSelect('call.participants', 'participant')
      .leftJoinAndSelect('participant.user', 'participantUser')
      .leftJoinAndSelect('call.invitedUsers', 'invitedUsers')
      .where(
        'call.initiatorId = :userId OR participantUser.id = :userId OR invitedUsers.id = :userId',
        { userId },
      )
      .orderBy('COALESCE(call.startedAt, call.updatedAt)', 'DESC');

    if (status) {
      queryBuilder.andWhere('call.status = :status', {
        status,
      });
    }

    const calls = await queryBuilder.getMany();
    const uniqueCalls = new Map<string, Call>();

    for (const call of calls) {
      uniqueCalls.set(call.id, call);
    }

    const uniqueCallList = Array.from(uniqueCalls.values());
    const transitionedCalls = await Promise.all(
      uniqueCallList.map((callEntity) =>
        this.applyScheduledTransitions(callEntity),
      ),
    );

    return transitionedCalls.map((callEntity) =>
      this.formatCallResponse(callEntity),
    );
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

    const snapshot = await this.getCallSnapshot(callId);
    if (snapshot) {
      await this.emitCallUpdate(snapshot);
    }
  }

  async createSession(
    callId: string,
    userId: string,
  ): Promise<CallSessionResponseDto> {
    if (!this.livekitService.isEnabled) {
      throw new BadRequestException(
        'LiveKit integration is not configured on the server',
      );
    }

    let call = await this.callRepository.findOne({
      where: { id: callId },
      relations: ['initiator', 'participants', 'participants.user'],
    });

    if (!call) {
      throw new NotFoundException('Call not found');
    }

    call = await this.applyScheduledTransitions(call);

    if (call.status !== CallStatus.ACTIVE) {
      throw new BadRequestException('Call is not active');
    }

    const participant = call.participants.find(
      (item) => item.user.id === userId,
    );
    const isInitiator = call.initiator.id === userId;

    if (!participant && !isInitiator) {
      throw new ForbiddenException('You do not have access to this call');
    }

    if (!isInitiator && participant?.status !== ParticipantStatus.JOINED) {
      throw new ForbiddenException(
        'Join the call before requesting media session credentials',
      );
    }

    const settings = this.parseCallSettings(call.settings);
    if (!settings.roomName) {
      call = await this.persistCallSettings(call, { roomName: call.id });
    }

    await this.ensureLivekitRoom(call);

    const displayName = this.buildDisplayName(
      isInitiator ? call.initiator : participant?.user,
    );

    const token = await this.livekitService.createParticipantToken({
      roomName: this.getCallRoomName(call),
      identity: userId,
      name: displayName,
      metadata: {
        callId: call.id,
        userId,
        role: isInitiator ? 'host' : 'participant',
      },
      isHost: isInitiator,
    });

    this.logger.debug?.(
      `Issued LiveKit token for call ${call.id}: type=${typeof token}`,
    );

    return {
      roomName: this.getCallRoomName(call),
      token,
      url: this.livekitService.websocketUrl,
      identity: userId,
      isHost: isInitiator,
      participantId: participant?.id ?? null,
    };
  }

  private formatCallResponse(call: Call): CallResponseDto {
    const duration =
      call.startedAt && call.endedAt
        ? Math.floor((call.endedAt.getTime() - call.startedAt.getTime()) / 1000)
        : undefined;

    const settings = this.parseCallSettings(call.settings);
    const roomName = settings.roomName || call.id;

    return {
      id: call.id,
      title: call.title,
      description: settings.description,
      type: call.type,
      status: call.status,
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
      roomName,
      initiator: {
        id: call.initiator.id,
        firstName: call.initiator.firstName,
        lastName: call.initiator.lastName,
      },
      participants:
        call.participants?.map((participant) => ({
          id: participant.id,
          user: {
            id: participant.user.id,
            firstName: participant.user.firstName,
            lastName: participant.user.lastName,
          },
          status: participant.status,
          joinedAt:
            participant.status === ParticipantStatus.JOINED
              ? participant.joinedAt
              : undefined,
          leftAt: participant.leftAt ?? undefined,
          isMuted:
            participant.status === ParticipantStatus.JOINED
              ? participant.isMuted
              : false,
          isVideoEnabled:
            participant.status === ParticipantStatus.JOINED
              ? !participant.isVideoOff
              : false,
          isScreenSharing: false, // Would need to be tracked separately
          isHandRaised: false, // Would need to be tracked separately
          connectionQuality: 'good', // Would need to be tracked separately
        })) || [],
      duration,
      maxParticipants: call.participants?.length || 0,
    };
  }
}
