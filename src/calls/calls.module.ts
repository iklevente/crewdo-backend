import { Module, forwardRef } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { DatabaseModule } from '../config/database.module';
import { CallController } from './call.controller';
import { CallService } from './call.service';
import { LivekitService } from './livekit.service';
import { NotificationsModule } from '../notifications/notifications.module';
import { RealtimeModule } from '../realtime/realtime.module';

@Module({
  imports: [
    DatabaseModule,
    ConfigModule,
    forwardRef(() => NotificationsModule),
    forwardRef(() => RealtimeModule),
  ],
  controllers: [CallController],
  providers: [CallService, LivekitService],
  exports: [CallService],
})
export class CallsModule {}
