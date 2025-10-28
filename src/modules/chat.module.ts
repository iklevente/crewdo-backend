import { Module, forwardRef } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { DatabaseModule } from '../config/database.module';
import { NotificationModule } from './notification.module';

// Services
import { WorkspaceService } from '../services/workspace.service';
import { ChannelService } from '../services/channel.service';
import { MessageService } from '../services/message.service';
import { CallService } from '../services/call.service';
import { AttachmentService } from '../services/attachment.service';
import { LivekitService } from '../services/livekit.service';

// Controllers
import { WorkspaceController } from '../controllers/workspace.controller';
import { ChannelController } from '../controllers/channel.controller';
import { MessageController } from '../controllers/message.controller';
import { CallController } from '../controllers/call.controller';

// Gateway
import { ChatGateway } from '../websocket/chat.gateway';
import { PresenceController } from '../controllers/presence.controller';
import { PresenceService } from '../services/presence.service';

@Module({
  imports: [
    DatabaseModule,
    forwardRef(() => NotificationModule),
    ConfigModule,
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => {
        const secret =
          configService.get<string>('jwt.secret') ||
          process.env.JWT_SECRET ||
          'jwt_secret';

        return {
          secret,
          signOptions: { expiresIn: '24h' },
        };
      },
    }),
  ],
  controllers: [
    WorkspaceController,
    ChannelController,
    MessageController,
    CallController,
    PresenceController,
  ],
  providers: [
    WorkspaceService,
    ChannelService,
    MessageService,
    CallService,
    AttachmentService,
    LivekitService,
    PresenceService,
    ChatGateway,
  ],
  exports: [
    WorkspaceService,
    ChannelService,
    MessageService,
    CallService,
    AttachmentService,
    ChatGateway,
  ],
})
export class ChatModule {}
