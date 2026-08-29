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
  ) {}

  @Post('faq-search')
  @HttpCode(200)
  @Throttle({ default: { limit: 60, ttl: 60_000 } })
  @ApiHeader({ name: 'X-Voice-Widget-Key', required: true })
  @ApiOkResponse({ description: 'Up to three approved FAQ matches.' })
  async search(
    @Headers('x-voice-widget-key') widgetKey: string | undefined,
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

    try {
      const result = await this.voiceFaqs.search(context, dto.query);
      this.logger.log(
        `Voice FAQ tool completed channel=WEB_WIDGET locationResolved=${Boolean(context.locationId)} resultCount=${result.matches.length} latencyMs=${Date.now() - startedAt}`,
      );
      return result;
    } catch (error) {
      this.logger.error(
        `Voice FAQ tool failed channel=WEB_WIDGET locationResolved=${Boolean(context.locationId)} latencyMs=${Date.now() - startedAt}`,
      );
      throw error;
    }
  }
}
