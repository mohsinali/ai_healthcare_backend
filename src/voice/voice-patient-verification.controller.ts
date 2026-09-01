import {
  Body,
  Controller,
  Headers,
  HttpCode,
  Post,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiHeader,
  ApiOkResponse,
  ApiTags,
} from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { Public } from '../auth/decorators/public.decorator';
import { VoiceServiceAuthGuard } from './auth/voice-service-auth.guard';
import {
  VoiceIdentifyPatientDto,
  VoiceVerifyPatientDto,
} from './dto/voice-patient-verification.dto';
import {
  PatientVerificationResponse,
  VoicePatientVerificationService,
} from './voice-patient-verification.service';
import { VoiceToolSessionService } from './voice-tool-session.service';

@ApiTags('voice tools')
@ApiBearerAuth('voice-service')
@Public()
@UseGuards(VoiceServiceAuthGuard)
@Controller('voice/tools')
export class VoicePatientVerificationController {
  constructor(
    private readonly toolSessions: VoiceToolSessionService,
    private readonly verification: VoicePatientVerificationService,
  ) {}

  @Post('identify-patient')
  @HttpCode(200)
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @ApiHeader({ name: 'X-Voice-Widget-Key', required: true })
  @ApiHeader({ name: 'X-Voice-Session-Token', required: true })
  @ApiOkResponse({
    description: 'Privacy-preserving identification flow status.',
  })
  async identify(
    @Headers('x-voice-widget-key') widgetKey: string | undefined,
    @Headers('x-voice-session-token') sessionToken: string | undefined,
    @Body() dto: VoiceIdentifyPatientDto,
  ): Promise<PatientVerificationResponse> {
    const resolved = await this.toolSessions.resolve(sessionToken, widgetKey);
    return this.verification.identify(resolved, dto);
  }

  @Post('verify-patient')
  @HttpCode(200)
  @Throttle({ default: { limit: 6, ttl: 60_000 } })
  @ApiHeader({ name: 'X-Voice-Widget-Key', required: true })
  @ApiHeader({ name: 'X-Voice-Session-Token', required: true })
  @ApiOkResponse({
    description: 'Privacy-preserving verification flow status.',
  })
  async verify(
    @Headers('x-voice-widget-key') widgetKey: string | undefined,
    @Headers('x-voice-session-token') sessionToken: string | undefined,
    @Body() dto: VoiceVerifyPatientDto,
  ): Promise<PatientVerificationResponse> {
    const resolved = await this.toolSessions.resolve(sessionToken, widgetKey);
    return this.verification.verify(resolved, dto.phoneNumber);
  }
}
