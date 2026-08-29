import { Module } from '@nestjs/common';
import { TelephonyModule } from '../telephony/telephony.module';
import { FaqsModule } from '../faqs/faqs.module';
import { WebVoiceModule } from '../web-voice/web-voice.module';
import { VoiceServiceAuthGuard } from './auth/voice-service-auth.guard';
import { VoiceBootstrapController } from './voice-bootstrap.controller';
import { VoiceBootstrapService } from './voice-bootstrap.service';
import { VoiceFaqController } from './voice-faq.controller';
import { VoiceFaqService } from './voice-faq.service';

@Module({
  imports: [TelephonyModule, FaqsModule, WebVoiceModule],
  controllers: [VoiceBootstrapController, VoiceFaqController],
  providers: [VoiceBootstrapService, VoiceFaqService, VoiceServiceAuthGuard],
  exports: [VoiceBootstrapService],
})
export class VoiceModule {}
