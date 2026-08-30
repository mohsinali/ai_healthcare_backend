import {
  BadRequestException,
  Body,
  Controller,
  Headers,
  HttpCode,
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
import { VoiceProviderSearchDto } from './dto/voice-provider-search.dto';
import { VoiceServiceSearchDto } from './dto/voice-service-search.dto';
import {
  VoiceDirectoryService,
  VoiceProviderSearchResponse,
  VoiceServiceSearchResponse,
} from './voice-directory.service';
import { VoiceSelectedLocationService } from './voice-selected-location.service';

@ApiTags('voice tools')
@ApiBearerAuth('voice-service')
@Public()
@UseGuards(VoiceServiceAuthGuard)
@Controller('voice/tools')
export class VoiceDirectoryController {
  constructor(
    private readonly resolver: WebVoiceChannelResolverService,
    private readonly directory: VoiceDirectoryService,
    private readonly selectedLocations: VoiceSelectedLocationService,
  ) {}

  @Post('search-services')
  @HttpCode(200)
  @Throttle({ default: { limit: 60, ttl: 60_000 } })
  @ApiHeader({ name: 'X-Voice-Widget-Key', required: true })
  @ApiHeader({ name: 'X-Voice-Selected-Location-Key', required: false })
  @ApiOkResponse({
    description: 'Voice-safe services at the selected location.',
  })
  async searchServices(
    @Headers('x-voice-widget-key') widgetKey: string | undefined,
    @Headers('x-voice-selected-location-key') selectedKey: string | undefined,
    @Body() dto: VoiceServiceSearchDto,
  ): Promise<VoiceServiceSearchResponse> {
    const { context, locationId } = await this.scope(widgetKey, selectedKey);
    return this.directory.searchServices(context, dto.query, locationId);
  }

  @Post('search-providers')
  @HttpCode(200)
  @Throttle({ default: { limit: 60, ttl: 60_000 } })
  @ApiHeader({ name: 'X-Voice-Widget-Key', required: true })
  @ApiHeader({ name: 'X-Voice-Selected-Location-Key', required: false })
  @ApiOkResponse({
    description: 'Voice-safe providers at the selected location.',
  })
  async searchProviders(
    @Headers('x-voice-widget-key') widgetKey: string | undefined,
    @Headers('x-voice-selected-location-key') selectedKey: string | undefined,
    @Body() dto: VoiceProviderSearchDto,
  ): Promise<VoiceProviderSearchResponse> {
    const { context, locationId } = await this.scope(widgetKey, selectedKey);
    return this.directory.searchProviders(context, dto, locationId);
  }

  private async scope(widgetKey?: string, selectedKey?: string) {
    if (!widgetKey || !WIDGET_KEY_PATTERN.test(widgetKey)) {
      throw new BadRequestException(
        'X-Voice-Widget-Key is required and must be valid.',
      );
    }
    const context = await this.resolver.resolve(widgetKey);
    if (!context)
      throw new NotFoundException('Web voice channel is unavailable.');
    const key = selectedKey?.trim();
    const selectedLocationId = key
      ? await this.selectedLocations.resolve(context.tenantId, key)
      : undefined;
    return { context, locationId: selectedLocationId ?? context.locationId };
  }
}
