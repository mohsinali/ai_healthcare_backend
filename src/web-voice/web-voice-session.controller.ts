import { Body, Controller, HttpCode, Post } from '@nestjs/common';
import {
  ApiBadGatewayResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { Public } from '../auth/decorators/public.decorator';
import { CreateWebVoiceSessionDto } from './dto/create-web-voice-session.dto';
import { WebVoiceSessionService } from './web-voice-session.service';

@ApiTags('web voice sessions')
// Public by design: the opaque widget key is routing input, and the resolver
// establishes trusted tenant/location context without clinic or gateway auth.
@Public()
@Controller('voice/web')
export class WebVoiceSessionController {
  constructor(private readonly sessions: WebVoiceSessionService) {}

  @Post('session')
  @HttpCode(200)
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @ApiOperation({
    summary: 'Create an anonymous, short-lived ElevenLabs web conversation URL',
  })
  @ApiOkResponse({
    schema: {
      example: {
        signedUrl: 'wss://api.elevenlabs.io/...',
        context: {
          tenantName: 'Sunshine Medical',
          locationName: 'Downtown Clinic',
          locationResolved: true,
          channel: 'WEB_WIDGET',
        },
      },
    },
  })
  @ApiNotFoundResponse({ description: 'Widget channel unavailable' })
  @ApiBadGatewayResponse({
    description: 'Voice provider temporarily unavailable',
  })
  create(@Body() dto: CreateWebVoiceSessionDto) {
    return this.sessions.create(dto.widgetKey);
  }
}
