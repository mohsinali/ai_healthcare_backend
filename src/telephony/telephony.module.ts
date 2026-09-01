import { Module } from '@nestjs/common';
import { DatabaseModule } from '../database/database.module';
import { InboundNumberResolverService } from './inbound-number-resolver.service';
import { TelephonyController } from './telephony.controller';
import { TelephonyService } from './telephony.service';

@Module({
  imports: [DatabaseModule],
  controllers: [TelephonyController],
  providers: [TelephonyService, InboundNumberResolverService],
  exports: [InboundNumberResolverService],
})
export class TelephonyModule {}
