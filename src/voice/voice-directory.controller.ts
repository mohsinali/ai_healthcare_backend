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
import { VoiceProviderSearchDto } from './dto/voice-provider-search.dto';
import { VoiceServiceSearchDto } from './dto/voice-service-search.dto';
import { VoiceAvailabilitySearchDto } from './dto/voice-availability-search.dto';
import { VoiceBookAppointmentDto } from './dto/voice-book-appointment.dto';
import {
  VoiceAppointmentBookingService,
  VoiceBookingResponse,
} from './voice-appointment-booking.service';
import {
  VoiceAvailabilityResponse,
  VoiceAvailabilityService,
} from './voice-availability.service';
import {
  VoiceDirectoryService,
  VoiceProviderSearchResponse,
  VoiceServiceSearchResponse,
} from './voice-directory.service';
import { VoiceToolSessionService } from './voice-tool-session.service';

@ApiTags('voice tools')
@ApiBearerAuth('voice-service')
@Public()
@UseGuards(VoiceServiceAuthGuard)
@Controller('voice/tools')
export class VoiceDirectoryController {
  constructor(
    private readonly directory: VoiceDirectoryService,
    private readonly toolSessions: VoiceToolSessionService,
    private readonly availability: VoiceAvailabilityService,
    private readonly booking: VoiceAppointmentBookingService,
  ) {}

  @Post('search-services')
  @HttpCode(200)
  @Throttle({ default: { limit: 60, ttl: 60_000 } })
  @ApiHeader({ name: 'X-Voice-Widget-Key', required: true })
  @ApiHeader({ name: 'X-Voice-Selected-Location-Key', required: false })
  @ApiHeader({ name: 'X-Voice-Session-Token', required: true })
  @ApiOkResponse({
    description: 'Voice-safe services at the selected location.',
  })
  async searchServices(
    @Headers('x-voice-widget-key') widgetKey: string | undefined,
    @Headers('x-voice-selected-location-key') selectedKey: string | undefined,
    @Headers('x-voice-session-token') sessionToken: string | undefined,
    @Body() dto: VoiceServiceSearchDto,
  ): Promise<VoiceServiceSearchResponse> {
    const { context, session } = await this.toolSessions.resolve(
      sessionToken,
      widgetKey,
      selectedKey,
    );
    const locationId = session.selectedLocationId ?? undefined;
    return this.directory.searchServices(context, dto.query, locationId);
  }

  @Post('search-providers')
  @HttpCode(200)
  @Throttle({ default: { limit: 60, ttl: 60_000 } })
  @ApiHeader({ name: 'X-Voice-Widget-Key', required: true })
  @ApiHeader({ name: 'X-Voice-Selected-Location-Key', required: false })
  @ApiHeader({ name: 'X-Voice-Session-Token', required: true })
  @ApiOkResponse({
    description: 'Voice-safe providers at the selected location.',
  })
  async searchProviders(
    @Headers('x-voice-widget-key') widgetKey: string | undefined,
    @Headers('x-voice-selected-location-key') selectedKey: string | undefined,
    @Headers('x-voice-session-token') sessionToken: string | undefined,
    @Body() dto: VoiceProviderSearchDto,
  ): Promise<VoiceProviderSearchResponse> {
    const { context, session } = await this.toolSessions.resolve(
      sessionToken,
      widgetKey,
      selectedKey,
    );
    const locationId = session.selectedLocationId ?? undefined;
    return this.directory.searchProviders(context, dto, locationId);
  }

  @Post('search-availability')
  @HttpCode(200)
  @Throttle({ default: { limit: 60, ttl: 60_000 } })
  @ApiHeader({ name: 'X-Voice-Widget-Key', required: true })
  @ApiHeader({ name: 'X-Voice-Selected-Location-Key', required: false })
  @ApiHeader({ name: 'X-Voice-Session-Token', required: true })
  @ApiOkResponse({ description: 'Voice-safe open appointment slots.' })
  async searchAvailability(
    @Headers('x-voice-widget-key') widgetKey: string | undefined,
    @Headers('x-voice-selected-location-key') selectedKey: string | undefined,
    @Headers('x-voice-session-token') sessionToken: string | undefined,
    @Body() dto: VoiceAvailabilitySearchDto,
  ): Promise<VoiceAvailabilityResponse> {
    const { context, session } = await this.toolSessions.resolve(
      sessionToken,
      widgetKey,
      selectedKey,
    );
    const locationId = session.selectedLocationId ?? undefined;
    return this.availability.search(context, dto, locationId);
  }

  @Post('book-appointment')
  @HttpCode(200)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @ApiHeader({ name: 'X-Voice-Widget-Key', required: true })
  @ApiHeader({ name: 'X-Voice-Selected-Location-Key', required: false })
  @ApiHeader({ name: 'X-Voice-Session-Token', required: true })
  @ApiOkResponse({ description: 'Voice-safe appointment booking outcome.' })
  async bookAppointment(
    @Headers('x-voice-widget-key') widgetKey: string | undefined,
    @Headers('x-voice-selected-location-key') selectedKey: string | undefined,
    @Headers('x-voice-session-token') sessionToken: string | undefined,
    @Body() dto: VoiceBookAppointmentDto,
  ): Promise<VoiceBookingResponse> {
    const resolved = await this.toolSessions.resolve(
      sessionToken,
      widgetKey,
      selectedKey,
    );
    return this.booking.book(resolved, dto);
  }
}
