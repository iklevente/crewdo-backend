import { Module, forwardRef } from '@nestjs/common';
import { DatabaseModule } from '../config/database.module';
import { NotificationController } from './notification.controller';
import { NotificationService } from './notification.service';
import { RealtimeModule } from '../realtime/realtime.module';

@Module({
  imports: [DatabaseModule, forwardRef(() => RealtimeModule)],
  controllers: [NotificationController],
  providers: [NotificationService],
  exports: [NotificationService],
})
export class NotificationsModule {}
