import { Module } from '@nestjs/common';
import { TasksService } from './tasks.service';
import { TasksController } from './tasks.controller';
import { DatabaseModule } from '../config/database.module';
import { NotificationModule } from '../modules/notification.module';
import { ChatModule } from '../modules/chat.module';

@Module({
  imports: [DatabaseModule, NotificationModule, ChatModule],
  controllers: [TasksController],
  providers: [TasksService],
  exports: [TasksService],
})
export class TasksModule {}
