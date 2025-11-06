import {
  INestApplication,
  ValidationPipe,
  CanActivate,
  ExecutionContext,
} from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { MessageController } from '../src/messages/message.controller';
import { MessageService } from '../src/messages/message.service';
import { ChannelService } from '../src/channels/channel.service';
import { ChatGateway } from '../src/realtime/chat.gateway';
import { JwtAuthGuard } from '../src/auth/guards/jwt-auth.guard';

describe('GET /api/messages/channel/:channelId (e2e)', () => {
  let app: INestApplication;

  const mockMessageService: Partial<MessageService> = {
    findByChannel: async (channelId: string, userId: string) => {
      return {
        messages: [
          {
            id: 'msg-1',
            content: 'Hello world',
            isEdited: false,
            isDeleted: false,
            isSystemMessage: false,
            createdAt: new Date().toISOString() as unknown as Date,
            updatedAt: new Date().toISOString() as unknown as Date,
            editedAt: new Date().toISOString() as unknown as Date,
            author: {
              id: userId,
              firstName: 'Test',
              lastName: 'User',
              email: 'user@example.com',
            },
            channel: {
              id: channelId,
              name: 'general',
              type: 'PUBLIC',
            },
            parentMessage: undefined,
            attachments: [],
            reactions: [],
          },
        ],
        hasMore: false,
        nextCursor: undefined,
      };
    },
  } as Partial<MessageService>;

  const mockChannelService: Partial<ChannelService> = {};

  const mockChatGateway: Partial<ChatGateway> = {};

  class AllowAllAuthGuard implements CanActivate {
    canActivate(context: ExecutionContext): boolean {
      const req = context.switchToHttp().getRequest();
      req.user = { id: 'user-1', role: 'MEMBER' };
      return true;
    }
  }

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [MessageController],
      providers: [
        { provide: MessageService, useValue: mockMessageService },
        { provide: ChannelService, useValue: mockChannelService },
        { provide: ChatGateway, useValue: mockChatGateway },
      ],
    })
      .overrideGuard(JwtAuthGuard)
      .useClass(AllowAllAuthGuard)
      .compile();

    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api');
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('returns messages for the channel', async () => {
    const channelId = '3d6f0a88-9c3b-4f2e-ae12-8b1c5b3a0c9b';
    const res = await request(app.getHttpServer())
      .get(`/api/messages/channel/${channelId}`)
      .set('Authorization', 'Bearer test')
      .expect(200);

    expect(res.body).toEqual(
      expect.objectContaining({
        messages: expect.arrayContaining([
          expect.objectContaining({
            id: 'msg-1',
            channel: expect.objectContaining({ id: channelId }),
          }),
        ]),
        hasMore: false,
      }),
    );
  });
});
