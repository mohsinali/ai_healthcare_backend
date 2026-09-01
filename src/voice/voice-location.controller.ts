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
import { VoiceToolSessionService } from './voice-tool-session.service';
import { VoiceSelectedLocationService } from './voice-selected-location.service';
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
    private readonly locations: VoiceLocationService,
    private readonly toolSessions: VoiceToolSessionService,
    private readonly selectedLocations: VoiceSelectedLocationService,
  ) {}

  @Post('resolve-location')
  @HttpCode(200)
  @Throttle({ default: { limit: 60, ttl: 60_000 } })
  @ApiHeader({ name: 'X-Voice-Widget-Key', required: true })
  @ApiHeader({ name: 'X-Voice-Session-Token', required: true })
  @ApiOkResponse({
    description: 'A resolved location or a small candidate list.',
  })
  async resolve(
    @Headers('x-voice-widget-key') widgetKey: string | undefined,
    @Headers('x-voice-session-token') sessionToken: string | undefined,
    @Body() dto: VoiceResolveLocationDto,
  ): Promise<VoiceLocationResponse> {
    const startedAt = Date.now();
    const resolvedSession = await this.toolSessions.resolve(
      sessionToken,
      widgetKey,
    );
    const { context } = resolvedSession;
    const result = await this.locations.resolve(context, dto.query);
    if (result.resolved) {
      const locationId = await this.selectedLocations.resolve(
        context.tenantId,
        result.location.key,
      );
      await this.toolSessions.bindLocation(resolvedSession, locationId);
    }
    this.logger.log(
      `Voice location tool completed channel=WEB_WIDGET resolved=${result.resolved} latencyMs=${Date.now() - startedAt}`,
    );
    return result;
  }
}
