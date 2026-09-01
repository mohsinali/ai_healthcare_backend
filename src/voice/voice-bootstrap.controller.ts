import { Body, Controller, HttpCode, Post, UseGuards } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { Public } from '../auth/decorators/public.decorator';
import { VoiceServiceAuthGuard } from './auth/voice-service-auth.guard';
import { VoiceBootstrapResponse } from './context/voice-context';
import { BootstrapVoiceDto } from './dto/bootstrap-voice.dto';
import { VoiceBootstrapService } from './voice-bootstrap.service';

@ApiTags('voice gateway')
@ApiBearerAuth('voice-service')
@Public()
@UseGuards(VoiceServiceAuthGuard)
@Controller('voice')
export class VoiceBootstrapController {
  constructor(private readonly bootstrapService: VoiceBootstrapService) {}

  @Post('bootstrap')
  @HttpCode(200)
  @Throttle({ default: { limit: 60, ttl: 60_000 } })
  @ApiOperation({
    summary: 'Resolve trusted voice routing context from an inbound number',
  })
  @ApiOkResponse({
    schema: {
      example: {
        context: {
          tenantId: 'tenant-id',
          tenantName: 'Sunshine Medical',
          locationId: 'location-id',
          locationName: 'Downtown Clinic',
          timezone: 'America/New_York',
          channel: 'PHONE',
        },
        calledNumber: '+13055551001',
      },
    },
  })
  @ApiBadRequestResponse({ description: 'Invalid request or phone number' })
  @ApiUnauthorizedResponse({ description: 'Invalid machine credential' })
  @ApiNotFoundResponse({ description: 'Inbound destination unavailable' })
  bootstrap(@Body() dto: BootstrapVoiceDto): Promise<VoiceBootstrapResponse> {
    return this.bootstrapService.bootstrap(dto.calledNumber);
  }
}
