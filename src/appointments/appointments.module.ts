import { Module } from '@nestjs/common';
import { DatabaseModule } from '../database/database.module';
import { SequencesModule } from '../sequences/sequences.module';
import {
  AppointmentsController,
  SchedulingController,
} from './appointments.controller';
import { AppointmentsService } from './appointments.service';

@Module({
  imports: [DatabaseModule, SequencesModule],
  controllers: [AppointmentsController, SchedulingController],
  providers: [AppointmentsService],
})
export class AppointmentsModule {}
