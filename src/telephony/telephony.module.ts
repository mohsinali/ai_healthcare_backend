import { Module } from '@nestjs/common';
import { InboundNumberResolverService } from './inbound-number-resolver.service';
import { TelephonyController } from './telephony.controller';
import { TelephonyService } from './telephony.service';

@Module({
  controllers: [TelephonyController],
  providers: [TelephonyService, InboundNumberResolverService],
  exports: [InboundNumberResolverService],
})
export class TelephonyModule {}
