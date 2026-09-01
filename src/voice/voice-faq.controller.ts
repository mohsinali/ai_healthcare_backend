import {
  Body,
  Controller,
  Headers,
  HttpCode,
  Logger,
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
import { VoiceFaqSearchDto } from './dto/voice-faq-search.dto';
import { VoiceFaqService, VoiceFaqSearchResponse } from './voice-faq.service';
import { VoiceToolSessionService } from './voice-tool-session.service';

@ApiTags('voice tools')
@ApiBearerAuth('voice-service')
@Public()
@UseGuards(VoiceServiceAuthGuard)
@Controller('voice/tools')
export class VoiceFaqController {
  private readonly logger = new Logger(VoiceFaqController.name);

  constructor(
    private readonly voiceFaqs: VoiceFaqService,
    private readonly toolSessions: VoiceToolSessionService,
  ) {}

  @Post('faq-search')
  @HttpCode(200)
  @Throttle({ default: { limit: 60, ttl: 60_000 } })
  @ApiHeader({ name: 'X-Voice-Widget-Key', required: true })
  @ApiHeader({ name: 'X-Voice-Session-Token', required: true })
  @ApiHeader({ name: 'X-Voice-Selected-Location-Key', required: false })
  @ApiOkResponse({ description: 'Up to three approved FAQ matches.' })
  async search(
    @Headers('x-voice-widget-key') widgetKey: string | undefined,
    @Headers('x-voice-selected-location-key')
    selectedLocationKey: string | undefined,
    @Headers('x-voice-session-token') sessionToken: string | undefined,
    @Body() dto: VoiceFaqSearchDto,
  ): Promise<VoiceFaqSearchResponse> {
    const startedAt = Date.now();
    const normalizedSelectedLocationKey = selectedLocationKey?.trim();
    const { context, session } = await this.toolSessions.resolve(
      sessionToken,
      widgetKey,
      selectedLocationKey,
    );
    const effectiveLocationId = session.selectedLocationId ?? undefined;
    const locationSource = normalizedSelectedLocationKey
      ? 'selected'
      : 'session';

    try {
      const result = await this.voiceFaqs.search(
        context,
        dto.query,
        effectiveLocationId,
      );
      this.logger.log(
        `Voice FAQ tool completed channel=WEB_WIDGET selectedOverridePresent=${Boolean(normalizedSelectedLocationKey)} locationSource=${locationSource} locationResolved=${Boolean(effectiveLocationId)} resultCount=${result.matches.length} latencyMs=${Date.now() - startedAt}`,
      );
      return result;
    } catch (error) {
      this.logger.error(
        `Voice FAQ tool failed channel=WEB_WIDGET selectedOverridePresent=${Boolean(normalizedSelectedLocationKey)} locationSource=${locationSource} locationResolved=${Boolean(effectiveLocationId)} latencyMs=${Date.now() - startedAt}`,
      );
      throw error;
    }
  }
}
