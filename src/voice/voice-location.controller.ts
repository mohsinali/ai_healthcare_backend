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
import { WIDGET_KEY_PATTERN } from '../web-voice/dto/create-web-voice-session.dto';
import { WebVoiceChannelResolverService } from '../web-voice/web-voice-channel-resolver.service';
import { VoiceServiceAuthGuard } from './auth/voice-service-auth.guard';
import { VoiceResolveLocationDto } from './dto/voice-resolve-location.dto';
import {
  VoiceLocationResponse,
  VoiceLocationService,
} from './voice-location.service';

@ApiTags('voice tools')
@ApiBearerAuth('voice-service')
@Public()
@UseGuards(VoiceServiceAuthGuard)
@Controller('voice/tools')
export class VoiceLocationController {
  private readonly logger = new Logger(VoiceLocationController.name);

  constructor(
    private readonly resolver: WebVoiceChannelResolverService,
    private readonly locations: VoiceLocationService,
  ) {}

  @Post('resolve-location')
  @HttpCode(200)
  @Throttle({ default: { limit: 60, ttl: 60_000 } })
  @ApiHeader({ name: 'X-Voice-Widget-Key', required: true })
  @ApiOkResponse({
    description: 'A resolved location or a small candidate list.',
  })
  async resolve(
    @Headers('x-voice-widget-key') widgetKey: string | undefined,
    @Body() dto: VoiceResolveLocationDto,
  ): Promise<VoiceLocationResponse> {
    const startedAt = Date.now();
    if (!widgetKey || !WIDGET_KEY_PATTERN.test(widgetKey)) {
      throw new BadRequestException(
        'X-Voice-Widget-Key is required and must be valid.',
      );
    }
    const context = await this.resolver.resolve(widgetKey);
    if (!context)
      throw new NotFoundException('Web voice channel is unavailable.');

    const result = await this.locations.resolve(context, dto.query);
    this.logger.log(
      `Voice location tool completed channel=WEB_WIDGET resolved=${result.resolved} latencyMs=${Date.now() - startedAt}`,
    );
    return result;
  }
}
