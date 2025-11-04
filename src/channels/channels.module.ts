import { Module, forwardRef } from '@nestjs/common';
import { DatabaseModule } from '../config/database.module';
import { RealtimeModule } from '../realtime/realtime.module';
import { ChannelController } from './channel.controller';
import { ChannelService } from './channel.service';

@Module({
  imports: [DatabaseModule, forwardRef(() => RealtimeModule)],
  controllers: [ChannelController],
  providers: [ChannelService],
  exports: [ChannelService],
})
export class ChannelsModule {}
