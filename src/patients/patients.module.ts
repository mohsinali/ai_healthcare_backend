import { Module } from '@nestjs/common';
import { DatabaseModule } from '../database/database.module';
import { SequencesModule } from '../sequences/sequences.module';
import { PatientsController } from './patients.controller';
import { PatientsService } from './patients.service';
@Module({
  imports: [DatabaseModule, SequencesModule],
  controllers: [PatientsController],
  providers: [PatientsService],
  exports: [PatientsService],
})
export class PatientsModule {}
