import { Module } from '@nestjs/common';
import { DatabaseModule } from '../database/database.module';
import { SequencesModule } from '../sequences/sequences.module';
import {
  LocationsController,
  ProvidersController,
  ServicesController,
} from './clinic-config.controller';
import { LocationsService } from './locations.service';
import { ProvidersService } from './providers.service';
import { ServicesService } from './services.service';
@Module({
  imports: [DatabaseModule, SequencesModule],
  controllers: [LocationsController, ProvidersController, ServicesController],
  providers: [LocationsService, ProvidersService, ServicesService],
})
export class ClinicConfigModule {}
