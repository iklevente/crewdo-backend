import { Injectable, NotFoundException, Inject } from '@nestjs/common';
import { Repository, DataSource } from 'typeorm';
import {
  UserPresence,
  User,
  UserActivity,
  UserPresenceStatus,
} from '../entities/index';
import {
  UpdatePresenceDto,
  PresenceResponseDto,
  PresenceStatus,
} from '../dto/presence.dto';

@Injectable()
export class PresenceService {
  private presenceRepository: Repository<UserPresence>;
  private userRepository: Repository<User>;

  private mapDtoStatusToEntity(dtoStatus: PresenceStatus): UserPresenceStatus {
    switch (dtoStatus) {
      case PresenceStatus.ONLINE:
        return UserPresenceStatus.ONLINE;
      case PresenceStatus.AWAY:
        return UserPresenceStatus.AWAY;
      case PresenceStatus.DO_NOT_DISTURB:
        return UserPresenceStatus.BUSY;
      case PresenceStatus.OFFLINE:
        return UserPresenceStatus.OFFLINE;
      default:
        return UserPresenceStatus.OFFLINE;
    }
  }

  private mapEntityStatusToDto(
    entityStatus: UserPresenceStatus,
  ): PresenceStatus {
    switch (entityStatus) {
      case UserPresenceStatus.ONLINE:
        return PresenceStatus.ONLINE;
      case UserPresenceStatus.AWAY:
        return PresenceStatus.AWAY;
      case UserPresenceStatus.BUSY:
        return PresenceStatus.DO_NOT_DISTURB;
      case UserPresenceStatus.OFFLINE:
        return PresenceStatus.OFFLINE;
      case UserPresenceStatus.INVISIBLE:
        return PresenceStatus.OFFLINE;
      default:
        return PresenceStatus.OFFLINE;
    }
  }

  constructor(
    @Inject('DATA_SOURCE')
    private dataSource: DataSource,
  ) {
    this.presenceRepository = this.dataSource.getRepository(UserPresence);
    this.userRepository = this.dataSource.getRepository(User);
  }

  async updatePresence(
    userId: string,
    updatePresenceDto: UpdatePresenceDto,
  ): Promise<PresenceResponseDto> {
    let presence = await this.presenceRepository.findOne({
      where: { user: { id: userId } },
      relations: ['user'],
    });

    if (!presence) {
      const user = await this.userRepository.findOne({ where: { id: userId } });
      if (!user) {
        throw new NotFoundException('User not found');
      }

      presence = this.presenceRepository.create({
        user,
        status: this.mapDtoStatusToEntity(updatePresenceDto.status),
        customStatus: updatePresenceDto.customStatus || '',
        activity: updatePresenceDto.isInCall
          ? UserActivity.IN_CALL
          : UserActivity.CODING,
        customData: updatePresenceDto.currentCallId
          ? JSON.stringify({ callId: updatePresenceDto.currentCallId })
          : undefined,
        lastSeenAt: new Date(),
      });
    } else {
      presence.status = this.mapDtoStatusToEntity(updatePresenceDto.status);
      presence.customStatus = updatePresenceDto.customStatus || '';
      presence.activity = updatePresenceDto.isInCall
        ? UserActivity.IN_CALL
        : UserActivity.CODING;
      presence.customData = updatePresenceDto.currentCallId
        ? JSON.stringify({ callId: updatePresenceDto.currentCallId })
        : null;
      presence.lastSeenAt = new Date();
    }

    const savedPresence = await this.presenceRepository.save(presence);
    return this.formatPresenceResponse(savedPresence);
  }

  async getPresence(userId: string): Promise<PresenceResponseDto> {
    const presence = await this.presenceRepository.findOne({
      where: { user: { id: userId } },
      relations: ['user'],
    });

    if (!presence) {
      // Return default offline status if no presence record exists
      const user = await this.userRepository.findOne({ where: { id: userId } });
      if (!user) {
        throw new NotFoundException('User not found');
      }

      return {
        id: `default-${userId}`,
        status: PresenceStatus.OFFLINE,
        isInCall: false,
        lastSeenAt: new Date(),
        updatedAt: new Date(),
        user: {
          id: user.id,
          firstName: user.firstName,
          lastName: user.lastName,
          email: user.email,
        },
      };
    }

    return this.formatPresenceResponse(presence);
  }

  async getMultiplePresences(
    userIds: string[],
  ): Promise<PresenceResponseDto[]> {
    const presences = await this.presenceRepository
      .createQueryBuilder('presence')
      .leftJoinAndSelect('presence.user', 'user')
      .where('user.id IN (:...userIds)', { userIds })
      .getMany();

    const presenceMap = new Map(presences.map((p) => [p.user.id, p]));

    // Get users that don't have presence records
    const users = await this.userRepository.findByIds(userIds);

    return users.map((user) => {
      const presence = presenceMap.get(user.id);
      if (presence) {
        return this.formatPresenceResponse(presence);
      } else {
        // Return default offline status
        return {
          id: `default-${user.id}`,
          status: PresenceStatus.OFFLINE,
          isInCall: false,
          lastSeenAt: new Date(),
          updatedAt: new Date(),
          user: {
            id: user.id,
            firstName: user.firstName,
            lastName: user.lastName,
            email: user.email,
          },
        };
      }
    });
  }

  async setUserOnline(userId: string): Promise<void> {
    await this.updatePresence(userId, {
      status: PresenceStatus.ONLINE,
    });
  }

  async setUserOffline(userId: string): Promise<void> {
    const presence = await this.presenceRepository.findOne({
      where: { user: { id: userId } },
      relations: ['user'],
    });

    if (presence) {
      presence.status = UserPresenceStatus.OFFLINE;
      presence.lastSeenAt = new Date();
      await this.presenceRepository.save(presence);
    }
  }

  async setUserInCall(userId: string, callId: string): Promise<void> {
    await this.updatePresence(userId, {
      status: PresenceStatus.ONLINE,
      isInCall: true,
      currentCallId: callId,
    });
  }

  async setUserLeftCall(userId: string): Promise<void> {
    const presence = await this.presenceRepository.findOne({
      where: { user: { id: userId } },
    });

    if (presence) {
      presence.activity = UserActivity.CODING; // Default activity
      presence.customData = null;
      await this.presenceRepository.save(presence);
    }
  }

  async updateUserActivity(
    userId: string,
    activity: UserActivity,
  ): Promise<void> {
    const presence = await this.presenceRepository.findOne({
      where: { user: { id: userId } },
    });

    if (presence) {
      presence.activity = activity;
      presence.lastSeenAt = new Date();
      await this.presenceRepository.save(presence);
    }
  }

  async clearUserActivity(userId: string): Promise<void> {
    const presence = await this.presenceRepository.findOne({
      where: { user: { id: userId } },
    });

    if (presence) {
      presence.activity = UserActivity.CODING; // Default activity
      await this.presenceRepository.save(presence);
    }
  }

  getWorkspacePresences(workspaceId: string): Promise<PresenceResponseDto[]> {
    // TODO: Implement getting all presences in a workspace for workspaceId
    void workspaceId; // Explicitly mark as unused until implemented
    return Promise.resolve([]);
  }

  getChannelPresences(channelId: string): Promise<PresenceResponseDto[]> {
    // TODO: Implement getting all presences in a channel for channelId
    void channelId; // Explicitly mark as unused until implemented
    return Promise.resolve([]);
  }

  private formatPresenceResponse(presence: UserPresence): PresenceResponseDto {
    return {
      id: presence.id,
      status: this.mapEntityStatusToDto(presence.status),
      customStatus: presence.customStatus,
      customStatusEmoji: undefined, // Not available in entity
      isInCall: presence.activity === UserActivity.IN_CALL,
      currentCallId: presence.customData
        ? (JSON.parse(presence.customData) as { callId?: string })?.callId
        : undefined,
      lastSeenAt: presence.lastSeenAt,
      updatedAt: presence.updatedAt,
      user: {
        id: presence.user.id,
        firstName: presence.user.firstName,
        lastName: presence.user.lastName,
        email: presence.user.email,
      },
    };
  }
}
