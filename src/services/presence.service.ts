import { Inject, Injectable, Logger } from '@nestjs/common';
import { DataSource, Repository } from 'typeorm';
import {
  PresenceSource,
  PresenceStatus,
  UserPresence,
} from '../entities/presence.entity';
import { PresenceResponseDto } from '../dto/presence.dto';

@Injectable()
export class PresenceService {
  private readonly logger = new Logger(PresenceService.name);
  private readonly presenceRepository: Repository<UserPresence>;

  constructor(@Inject('DATA_SOURCE') private readonly dataSource: DataSource) {
    this.presenceRepository = this.dataSource.getRepository(UserPresence);
  }

  async getAllPresence(): Promise<PresenceResponseDto[]> {
    const entities = await this.presenceRepository.find();
    return entities.map((entity) => PresenceResponseDto.fromEntity(entity));
  }

  async getPresenceForUser(userId: string): Promise<PresenceResponseDto> {
    const entity = await this.getOrCreatePresence(userId);
    return PresenceResponseDto.fromEntity(entity);
  }

  async setAutomaticStatus(
    userId: string,
    status: PresenceStatus,
  ): Promise<PresenceResponseDto> {
    const presence = await this.getOrCreatePresence(userId);

    const now = new Date();
    presence.lastSeenAt = now;

    if (status === PresenceStatus.OFFLINE) {
      presence.status = PresenceStatus.OFFLINE;
      presence.statusSource = PresenceSource.AUTO;
    } else if (presence.manualStatus) {
      presence.status = presence.manualStatus;
      presence.statusSource = PresenceSource.MANUAL;
    } else {
      presence.status = status;
      presence.statusSource = PresenceSource.AUTO;
    }

    const saved = await this.presenceRepository.save(presence);
    return PresenceResponseDto.fromEntity(saved);
  }

  async setManualStatus(
    userId: string,
    status: PresenceStatus,
  ): Promise<PresenceResponseDto> {
    const presence = await this.getOrCreatePresence(userId);
    const now = new Date();

    presence.manualStatus = status;
    presence.status = status;
    presence.statusSource = PresenceSource.MANUAL;
    presence.lastSeenAt = now;

    const saved = await this.presenceRepository.save(presence);
    return PresenceResponseDto.fromEntity(saved);
  }

  async clearManualStatus(
    userId: string,
    isOnline: boolean,
  ): Promise<PresenceResponseDto> {
    const presence = await this.getOrCreatePresence(userId);
    const now = new Date();

    presence.manualStatus = null;
    presence.statusSource = PresenceSource.AUTO;

    const shouldRemainOnline =
      isOnline || presence.status !== PresenceStatus.OFFLINE;

    presence.status = shouldRemainOnline
      ? PresenceStatus.ONLINE
      : PresenceStatus.OFFLINE;
    presence.lastSeenAt = now;

    const saved = await this.presenceRepository.save(presence);
    return PresenceResponseDto.fromEntity(saved);
  }

  async upsertPresenceSnapshot(entries: PresenceResponseDto[]): Promise<void> {
    // Utility to hydrate presence records from external snapshots if needed.
    if (!entries.length) {
      return;
    }

    await this.presenceRepository.manager.transaction(async (manager) => {
      for (const entry of entries) {
        const repository = manager.getRepository(UserPresence);
        let presence = await repository.findOne({
          where: { userId: entry.userId },
        });

        if (!presence) {
          presence = repository.create({
            userId: entry.userId,
          });
        }

        presence.status = entry.status;
        presence.statusSource = entry.statusSource;
        presence.manualStatus = entry.manualStatus ?? null;
        presence.lastSeenAt = entry.lastSeenAt
          ? new Date(entry.lastSeenAt)
          : presence.lastSeenAt;

        await repository.save(presence);
      }
    });
  }

  private async getOrCreatePresence(userId: string): Promise<UserPresence> {
    let presence = await this.presenceRepository.findOne({
      where: { userId },
    });

    if (!presence) {
      presence = this.presenceRepository.create({
        userId,
        status: PresenceStatus.OFFLINE,
        statusSource: PresenceSource.AUTO,
        manualStatus: null,
        lastSeenAt: null,
      });

      try {
        presence = await this.presenceRepository.save(presence);
      } catch (error) {
        this.logger.warn(
          `Failed to create presence record for user ${userId}: ${String(error)}`,
        );
        presence = await this.presenceRepository.findOneOrFail({
          where: { userId },
        });
      }
    }

    return presence;
  }
}
