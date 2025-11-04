import { Module, forwardRef } from '@nestjs/common';
import { DatabaseModule } from '../config/database.module';
import { RealtimeModule } from 'src/realtime/realtime.module';
import { WorkspaceController } from './workspace.controller';
import { WorkspaceService } from './workspace.service';

@Module({
  imports: [DatabaseModule, forwardRef(() => RealtimeModule)],
  controllers: [WorkspaceController],
  providers: [WorkspaceService],
  exports: [WorkspaceService],
})
export class WorkspacesModule {}
