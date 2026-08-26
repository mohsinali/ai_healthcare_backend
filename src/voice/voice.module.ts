import { Module } from '@nestjs/common';
import { TelephonyModule } from '../telephony/telephony.module';
import { VoiceServiceAuthGuard } from './auth/voice-service-auth.guard';
import { VoiceBootstrapController } from './voice-bootstrap.controller';
import { VoiceBootstrapService } from './voice-bootstrap.service';

@Module({
  imports: [TelephonyModule],
  controllers: [VoiceBootstrapController],
  providers: [VoiceBootstrapService, VoiceServiceAuthGuard],
  exports: [VoiceBootstrapService],
})
export class VoiceModule {}
