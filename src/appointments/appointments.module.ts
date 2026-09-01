import { Module } from '@nestjs/common';
import { DatabaseModule } from '../database/database.module';
import { SequencesModule } from '../sequences/sequences.module';
import {
  AppointmentsController,
  SchedulingController,
} from './appointments.controller';
import { AppointmentsService } from './appointments.service';
import { AvailabilitySearchService } from './availability-search.service';

@Module({
  imports: [DatabaseModule, SequencesModule],
  controllers: [AppointmentsController, SchedulingController],
  providers: [AppointmentsService, AvailabilitySearchService],
  exports: [AvailabilitySearchService],
})
export class AppointmentsModule {}
