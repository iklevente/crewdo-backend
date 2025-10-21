import { ApiProperty } from '@nestjs/swagger';
import {
  PresenceSource,
  PresenceStatus,
  UserPresence,
} from '../entities/presence.entity';
import { IsEnum } from 'class-validator';

export class PresenceResponseDto {
  @ApiProperty()
  userId: string;

  @ApiProperty({ enum: PresenceStatus })
  status: PresenceStatus;

  @ApiProperty({ enum: PresenceSource })
  statusSource: PresenceSource;

  @ApiProperty({ enum: PresenceStatus, required: false })
  manualStatus?: PresenceStatus | null;

  @ApiProperty({ required: false })
  lastSeenAt?: string | null;

  @ApiProperty()
  timestamp: string;

  static fromEntity(entity: UserPresence): PresenceResponseDto {
    return {
      userId: entity.userId,
      status: entity.status,
      statusSource: entity.statusSource,
      manualStatus: entity.manualStatus,
      lastSeenAt: entity.lastSeenAt?.toISOString() ?? null,
      timestamp: entity.updatedAt.toISOString(),
    };
  }
}

export class ManualPresenceUpdateDto {
  @ApiProperty({ enum: PresenceStatus })
  @IsEnum(PresenceStatus)
  status: PresenceStatus;
}
