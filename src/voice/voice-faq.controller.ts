import {
  BadRequestException,
  Body,
  Controller,
  Headers,
  HttpCode,
  Logger,
  NotFoundException,
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
import { WebVoiceChannelResolverService } from '../web-voice/web-voice-channel-resolver.service';
import { WIDGET_KEY_PATTERN } from '../web-voice/dto/create-web-voice-session.dto';
import { VoiceServiceAuthGuard } from './auth/voice-service-auth.guard';
import { VoiceFaqSearchDto } from './dto/voice-faq-search.dto';
import { VoiceFaqService, VoiceFaqSearchResponse } from './voice-faq.service';
import { VoiceSelectedLocationService } from './voice-selected-location.service';

@ApiTags('voice tools')
@ApiBearerAuth('voice-service')
@Public()
@UseGuards(VoiceServiceAuthGuard)
@Controller('voice/tools')
export class VoiceFaqController {
  private readonly logger = new Logger(VoiceFaqController.name);

  constructor(
    private readonly resolver: WebVoiceChannelResolverService,
    private readonly voiceFaqs: VoiceFaqService,
    private readonly selectedLocations: VoiceSelectedLocationService,
  ) {}

  @Post('faq-search')
  @HttpCode(200)
  @Throttle({ default: { limit: 60, ttl: 60_000 } })
  @ApiHeader({ name: 'X-Voice-Widget-Key', required: true })
  @ApiHeader({ name: 'X-Voice-Selected-Location-Key', required: false })
  @ApiOkResponse({ description: 'Up to three approved FAQ matches.' })
  async search(
    @Headers('x-voice-widget-key') widgetKey: string | undefined,
    @Headers('x-voice-selected-location-key')
    selectedLocationKey: string | undefined,
    @Body() dto: VoiceFaqSearchDto,
  ): Promise<VoiceFaqSearchResponse> {
    const startedAt = Date.now();
    if (!widgetKey || !WIDGET_KEY_PATTERN.test(widgetKey)) {
      throw new BadRequestException(
        'X-Voice-Widget-Key is required and must be valid.',
      );
    }
    const context = await this.resolver.resolve(widgetKey);
    if (!context)
      throw new NotFoundException('Web voice channel is unavailable.');

    const normalizedSelectedLocationKey = selectedLocationKey?.trim();
    const selectedLocationId = normalizedSelectedLocationKey
      ? await this.selectedLocations.resolve(
          context.tenantId,
          normalizedSelectedLocationKey,
        )
      : undefined;
    const effectiveLocationId = selectedLocationId ?? context.locationId;
    const locationSource = selectedLocationId ? 'selected' : 'default';

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
