import { Module } from '@nestjs/common';
import { CommentsService } from './comments.service';
import { CommentsController } from './comments.controller';
import { DatabaseModule } from '../config/database.module';
import { NotificationModule } from '../modules/notification.module';
import { ChatModule } from '../modules/chat.module';

@Module({
  imports: [DatabaseModule, NotificationModule, ChatModule],
  controllers: [CommentsController],
  providers: [CommentsService],
  exports: [CommentsService],
})
export class CommentsModule {}
