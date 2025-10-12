import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { DatabaseModule } from '../config/database.module';

// Services
import { WorkspaceService } from '../services/workspace.service';
import { ChannelService } from '../services/channel.service';
import { MessageService } from '../services/message.service';
import { CallService } from '../services/call.service';
import { PresenceService } from '../services/presence.service';
import { MediaService } from '../services/media.service';
import { RecordingService } from '../services/recording.service';

// Controllers
import { WorkspaceController } from '../controllers/workspace.controller';
import { ChannelController } from '../controllers/channel.controller';
import { MessageController } from '../controllers/message.controller';
import { CallController } from '../controllers/call.controller';
import { MediaController } from '../controllers/media.controller';

// Gateway
import { ChatGateway } from '../websocket/chat.gateway';

@Module({
  imports: [
    DatabaseModule,
    JwtModule.register({
      secret: process.env.JWT_SECRET || 'your-secret-key',
      signOptions: { expiresIn: '24h' },
    }),
  ],
  controllers: [
    WorkspaceController,
    ChannelController,
    MessageController,
    CallController,
    MediaController,
  ],
  providers: [
    WorkspaceService,
    ChannelService,
    MessageService,
    CallService,
    PresenceService,
    MediaService,
    RecordingService,
    ChatGateway,
  ],
  exports: [
    WorkspaceService,
    ChannelService,
    MessageService,
    CallService,
    PresenceService,
    MediaService,
    RecordingService,
  ],
})
export class ChatModule {}
