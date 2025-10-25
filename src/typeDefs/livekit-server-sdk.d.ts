declare module 'livekit-server-sdk' {
  export interface AccessTokenOptions {
    identity: string;
    name?: string;
    metadata?: string;
  }

  export interface ParticipantPermission {
    canPublish?: boolean;
    canPublishData?: boolean;
    canSubscribe?: boolean;
    canUpdateMetadata?: boolean;
    canUpdateOwnMetadata?: boolean;
    canLeave?: boolean;
    canShareScreen?: boolean;
    canPublishSources?: string[];
    hidden?: boolean;
    recorder?: boolean;
  }

  export interface CreateRoomOptions {
    name: string;
    emptyTimeout?: number;
    maxParticipants?: number;
    [key: string]: unknown;
  }

  export class AccessToken {
    constructor(
      apiKey: string,
      apiSecret: string,
      options?: AccessTokenOptions,
    );
    addGrant(grant: {
      roomJoin: boolean;
      room: string;
      roomAdmin?: boolean;
      permissions?: ParticipantPermission;
    }): void;
    toJwt(): string;
  }

  export class RoomServiceClient {
    constructor(host: string, apiKey: string, apiSecret: string);
    getRoom(roomName: string): Promise<unknown>;
    createRoom(options: CreateRoomOptions): Promise<unknown>;
  }
}
