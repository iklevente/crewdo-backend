import { Module, forwardRef } from '@nestjs/common';
import { DatabaseModule } from '../config/database.module';
import { AttachmentsModule } from '../attachments/attachments.module';
import { ChannelsModule } from '../channels/channels.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { RealtimeModule } from '../realtime/realtime.module';
import { MessageController } from './message.controller';
import { MessageService } from './message.service';

@Module({
  imports: [
    DatabaseModule,
    AttachmentsModule,
    forwardRef(() => ChannelsModule),
    forwardRef(() => NotificationsModule),
    forwardRef(() => RealtimeModule),
  ],
  controllers: [MessageController],
  providers: [MessageService],
  exports: [MessageService],
})
export class MessagesModule {}
