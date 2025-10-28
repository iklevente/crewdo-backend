import { Module, forwardRef } from '@nestjs/common';
import { NotificationController } from '../controllers/notification.controller';
import { NotificationService } from '../services/notification.service';
import { DatabaseModule } from '../config/database.module';
import { ChatModule } from './chat.module';

@Module({
  imports: [DatabaseModule, forwardRef(() => ChatModule)],
  controllers: [NotificationController],
  providers: [NotificationService],
  exports: [NotificationService],
})
export class NotificationModule {}
