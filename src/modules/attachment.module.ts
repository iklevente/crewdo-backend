import { Module } from '@nestjs/common';
import { AttachmentController } from '../controllers/attachment.controller';
import { AttachmentService } from '../services/attachment.service';
import { DatabaseModule } from '../config/database.module';

@Module({
  imports: [DatabaseModule],
  controllers: [AttachmentController],
  providers: [AttachmentService],
  exports: [AttachmentService],
})
export class AttachmentModule {}
