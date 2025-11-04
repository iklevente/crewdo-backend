import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { DatabaseModule } from '../config/database.module';
import { AttachmentService } from './attachment.service';
import { AttachmentController } from './attachment.controller';

@Module({
  imports: [DatabaseModule, ConfigModule],
  providers: [AttachmentService],
  exports: [AttachmentService],
  controllers: [AttachmentController],
})
export class AttachmentsModule {}
