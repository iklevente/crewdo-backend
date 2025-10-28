import { Module } from '@nestjs/common';
import { ProjectsService } from './projects.service';
import { ProjectsController } from './projects.controller';
import { DatabaseModule } from '../config/database.module';
import { NotificationModule } from '../modules/notification.module';
import { ChatModule } from '../modules/chat.module';

@Module({
  imports: [DatabaseModule, NotificationModule, ChatModule],
  controllers: [ProjectsController],
  providers: [ProjectsService],
  exports: [ProjectsService],
})
export class ProjectsModule {}
