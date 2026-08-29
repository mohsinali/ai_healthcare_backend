import { Module } from '@nestjs/common';
import { DatabaseModule } from '../database/database.module';
import { TelephonyModule } from '../telephony/telephony.module';
import { FaqsModule } from '../faqs/faqs.module';
import { WebVoiceModule } from '../web-voice/web-voice.module';
import { VoiceServiceAuthGuard } from './auth/voice-service-auth.guard';
import { VoiceBootstrapController } from './voice-bootstrap.controller';
import { VoiceBootstrapService } from './voice-bootstrap.service';
import { VoiceFaqController } from './voice-faq.controller';
import { VoiceFaqService } from './voice-faq.service';
import { VoiceLocationController } from './voice-location.controller';
import { VoiceLocationService } from './voice-location.service';
import { VoiceSelectedLocationService } from './voice-selected-location.service';

@Module({
  imports: [DatabaseModule, TelephonyModule, FaqsModule, WebVoiceModule],
  controllers: [
    VoiceBootstrapController,
    VoiceFaqController,
    VoiceLocationController,
  ],
  providers: [
    VoiceBootstrapService,
    VoiceFaqService,
    VoiceLocationService,
    VoiceSelectedLocationService,
    VoiceServiceAuthGuard,
  ],
  exports: [VoiceBootstrapService],
})
export class VoiceModule {}
