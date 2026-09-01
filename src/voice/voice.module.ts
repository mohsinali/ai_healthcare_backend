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
import { VoiceDirectoryController } from './voice-directory.controller';
import { VoiceDirectoryService } from './voice-directory.service';
import { AppointmentsModule } from '../appointments/appointments.module';
import { VoiceAvailabilityService } from './voice-availability.service';
import { VoiceSessionModule } from '../voice-session/voice-session.module';
import { VoiceToolSessionService } from './voice-tool-session.service';
import { VoicePatientVerificationController } from './voice-patient-verification.controller';
import { VoicePatientVerificationService } from './voice-patient-verification.service';

@Module({
  imports: [
    DatabaseModule,
    TelephonyModule,
    FaqsModule,
    WebVoiceModule,
    AppointmentsModule,
    VoiceSessionModule,
  ],
  controllers: [
    VoiceBootstrapController,
    VoiceFaqController,
    VoiceLocationController,
    VoiceDirectoryController,
    VoicePatientVerificationController,
  ],
  providers: [
    VoiceBootstrapService,
    VoiceFaqService,
    VoiceLocationService,
    VoiceSelectedLocationService,
    VoiceDirectoryService,
    VoiceAvailabilityService,
    VoiceServiceAuthGuard,
    VoiceToolSessionService,
    VoicePatientVerificationService,
  ],
  exports: [VoiceBootstrapService, VoicePatientVerificationService],
})
export class VoiceModule {}
