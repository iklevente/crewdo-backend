import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  AccessToken,
  AccessTokenOptions,
  RoomServiceClient,
  ParticipantPermission,
  CreateRoomOptions,
} from 'livekit-server-sdk';

interface LivekitRoomSummary {
  name?: string | null;
}

interface LivekitConfig {
  apiKey: string;
  apiSecret: string;
  wsUrl: string;
  apiUrl: string;
  roomEmptyTimeout: number;
  maxParticipants: number;
}

interface ParticipantTokenOptions {
  roomName: string;
  identity: string;
  name: string;
  metadata?: Record<string, unknown>;
  isHost?: boolean;
}

type RoomServiceAdapter = {
  getRoom(roomName: string): Promise<void>;
  createRoom(options: CreateRoomOptions): Promise<void>;
};

type AccessTokenAdapter = {
  addGrant(grant: {
    roomJoin: boolean;
    room: string;
    roomAdmin: boolean;
    permissions: ParticipantPermission;
  }): void;
  toJwt(): string;
};

type AccessTokenConstructor = new (
  apiKey: string,
  apiSecret: string,
  options: AccessTokenOptions,
) => unknown;

const AccessTokenCtor: AccessTokenConstructor =
  AccessToken as unknown as AccessTokenConstructor;

@Injectable()
export class LivekitService {
  private readonly logger = new Logger(LivekitService.name);

  private readonly config: LivekitConfig;
  private readonly roomService?: RoomServiceAdapter;

  constructor(private readonly configService: ConfigService) {
    this.config = {
      apiKey: this.configService.get<string>('livekit.apiKey', ''),
      apiSecret: this.configService.get<string>('livekit.apiSecret', ''),
      wsUrl: this.configService.get<string>('livekit.wsUrl', ''),
      apiUrl: this.configService.get<string>('livekit.apiUrl', ''),
      roomEmptyTimeout: this.configService.get<number>(
        'livekit.roomEmptyTimeout',
        120,
      ),
      maxParticipants: this.configService.get<number>(
        'livekit.maxParticipants',
        24,
      ),
    };

    if (this.hasValidConfiguration()) {
      try {
        type RoomServiceClientLike = {
          createRoom: (options: CreateRoomOptions) => Promise<unknown>;
          listRooms: () => Promise<LivekitRoomSummary[]>;
        };

        const rawClient = new RoomServiceClient(
          this.config.apiUrl,
          this.config.apiKey,
          this.config.apiSecret,
        ) as unknown as RoomServiceClientLike;

        if (
          typeof rawClient.createRoom === 'function' &&
          typeof rawClient.listRooms === 'function'
        ) {
          this.roomService = {
            getRoom: async (roomName: string) => {
              const rooms = await rawClient.listRooms();
              const exists = rooms.some((room) => {
                if (!room) {
                  return false;
                }

                const roomRecord = room as Record<string, unknown>;
                const candidateName = roomRecord.name;
                if (typeof candidateName !== 'string') {
                  return false;
                }

                return candidateName === roomName;
              });
              if (!exists) {
                throw new Error(`Room ${roomName} not found`);
              }
            },
            createRoom: async (options: CreateRoomOptions) => {
              await rawClient.createRoom(options);
            },
          };
        } else {
          this.logger.error(
            'LiveKit RoomServiceClient is missing expected methods. Media features disabled.',
          );
        }
      } catch (error) {
        this.logger.error(
          `Failed to initialize LiveKit RoomServiceClient: ${this.stringifyError(error)}`,
        );
      }
    } else {
      this.logger.warn(
        'LiveKit configuration incomplete. Media features will be disabled until LIVEKIT_* environment variables are provided.',
      );
    }
  }

  get websocketUrl(): string {
    return this.config.wsUrl;
  }

  get isEnabled(): boolean {
    return this.hasValidConfiguration();
  }

  private hasValidConfiguration(): boolean {
    return (
      Boolean(this.config.apiKey) &&
      Boolean(this.config.apiSecret) &&
      Boolean(this.config.wsUrl) &&
      Boolean(this.config.apiUrl)
    );
  }

  async ensureRoom(
    roomName: string,
    options: Partial<CreateRoomOptions> = {},
  ): Promise<void> {
    const roomService = this.roomService;

    if (!roomService) {
      throw new Error('LiveKit service is not configured');
    }

    try {
      await roomService.getRoom(roomName);
      return;
    } catch (error) {
      this.logger.debug(
        `Room ${roomName} not found, attempting to create. Reason: ${this.stringifyError(error)}`,
      );
    }

    const createOptions: CreateRoomOptions = {
      name: roomName,
      emptyTimeout: this.config.roomEmptyTimeout,
      maxParticipants: this.config.maxParticipants,
      ...options,
    };

    await roomService.createRoom(createOptions);
    this.logger.log(`Created LiveKit room ${roomName}`);
  }

  async createParticipantToken(
    options: ParticipantTokenOptions,
  ): Promise<string> {
    if (!this.hasValidConfiguration()) {
      throw new Error('LiveKit service is not configured');
    }

    const tokenOptions: AccessTokenOptions = {
      identity: options.identity,
      name: options.name,
      metadata: options.metadata ? JSON.stringify(options.metadata) : undefined,
    };

    const tokenInstance = new AccessTokenCtor(
      this.config.apiKey,
      this.config.apiSecret,
      tokenOptions,
    );

    this.assertAccessToken(tokenInstance);

    const permissions: ParticipantPermission = {
      canPublish: true,
      canPublishData: true,
      canSubscribe: true,
      canUpdateMetadata: Boolean(options.isHost),
      canUpdateOwnMetadata: true,
      canLeave: true,
      canShareScreen: true,
      canPublishSources: [
        'camera',
        'microphone',
        'screen_share',
        'screen_share_audio',
      ],
      hidden: false,
      recorder: false,
    };

    tokenInstance.addGrant({
      roomJoin: true,
      room: options.roomName,
      roomAdmin: Boolean(options.isHost),
      permissions,
    });

    const jwtCandidate = tokenInstance.toJwt();
    const jwt = await Promise.resolve(jwtCandidate);

    if (typeof jwt !== 'string') {
      throw new Error(
        `AccessToken.toJwt() returned unexpected type: ${typeof jwt}`,
      );
    }

    return jwt;
  }

  private isRoomServiceAdapter(value: unknown): value is RoomServiceAdapter {
    if (typeof value !== 'object' || value === null) {
      return false;
    }

    const hasGetRoom =
      typeof (value as { getRoom?: unknown }).getRoom === 'function';
    if (!hasGetRoom) {
      return false;
    }

    return typeof (value as { createRoom?: unknown }).createRoom === 'function';
  }

  private assertAccessToken(
    value: unknown,
  ): asserts value is AccessTokenAdapter {
    if (typeof value !== 'object' || value === null) {
      throw new Error('Invalid AccessToken instance');
    }

    const addGrant = (value as { addGrant?: unknown }).addGrant;
    if (typeof addGrant !== 'function') {
      throw new Error('Invalid AccessToken instance');
    }

    const toJwt = (value as { toJwt?: unknown }).toJwt;
    if (typeof toJwt !== 'function') {
      throw new Error('Invalid AccessToken instance');
    }
  }

  private stringifyError(error: unknown): string {
    if (error instanceof Error) {
      return error.message;
    }

    try {
      return JSON.stringify(error);
    } catch {
      return String(error);
    }
  }
}
