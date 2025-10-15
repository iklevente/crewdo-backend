import { Module } from '@nestjs/common';
import { TasksService } from './tasks.service';
import { TasksController } from './tasks.controller';
import { DatabaseModule } from '../config/database.module';
import { NotificationModule } from '../modules/notification.module';

@Module({
  imports: [DatabaseModule, NotificationModule],
  controllers: [TasksController],
  providers: [TasksService],
  exports: [TasksService],
})
export class TasksModule {}
