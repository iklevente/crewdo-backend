import { Module, forwardRef } from '@nestjs/common';
import { DatabaseModule } from '../config/database.module';
import { RealtimeModule } from '../realtime/realtime.module';
import { PresenceController } from './presence.controller';
import { PresenceService } from './presence.service';

@Module({
  imports: [DatabaseModule, forwardRef(() => RealtimeModule)],
  controllers: [PresenceController],
  providers: [PresenceService],
  exports: [PresenceService],
})
export class PresenceModule {}
