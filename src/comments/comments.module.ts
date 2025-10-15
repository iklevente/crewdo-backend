import { Module } from '@nestjs/common';
import { CommentsService } from './comments.service';
import { CommentsController } from './comments.controller';
import { DatabaseModule } from '../config/database.module';
import { NotificationModule } from '../modules/notification.module';

@Module({
  imports: [DatabaseModule, NotificationModule],
  controllers: [CommentsController],
  providers: [CommentsService],
  exports: [CommentsService],
})
export class CommentsModule {}
