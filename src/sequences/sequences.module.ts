import { Module } from '@nestjs/common';
import { DatabaseModule } from '../database/database.module';
import { SequenceService } from './sequence.service';

@Module({
  imports: [DatabaseModule],
  providers: [SequenceService],
  exports: [SequenceService],
})
export class SequencesModule {}
