import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { WebVoiceChannelResolverService } from '../web-voice/web-voice-channel-resolver.service';
import { WIDGET_KEY_PATTERN } from '../web-voice/dto/create-web-voice-session.dto';
import { VoiceSessionService } from '../voice-session/voice-session.service';
import { VoiceSessionRecord } from '../voice-session/voice-session.types';
import { WebWidgetVoiceContext } from './context/voice-context';
import { VoiceSelectedLocationService } from './voice-selected-location.service';

export interface ResolvedVoiceToolSession {
  context: WebWidgetVoiceContext;
  session: VoiceSessionRecord;
  token: string;
}

@Injectable()
export class VoiceToolSessionService {
  constructor(
    private readonly channels: WebVoiceChannelResolverService,
    private readonly sessions: VoiceSessionService,
    private readonly selectedLocations: VoiceSelectedLocationService,
  ) {}

  async resolve(
    token: string | undefined,
    widgetKey: string | undefined,
    selectedLocationKey?: string,
  ): Promise<ResolvedVoiceToolSession> {
    if (!widgetKey || !WIDGET_KEY_PATTERN.test(widgetKey)) {
      throw new BadRequestException(
        'X-Voice-Widget-Key is required and must be valid.',
      );
    }
    const context = await this.channels.resolve(widgetKey);
    if (!context)
      throw new NotFoundException('Web voice channel is unavailable.');
    let session = await this.sessions.resolve(token);
    this.sessions.assertMatches(
      session,
      context.tenantId,
      context.channel,
      context.webVoiceChannelId,
    );

    const selectedKey = selectedLocationKey?.trim();
    if (selectedKey) {
      const locationId = await this.selectedLocations.resolve(
        context.tenantId,
        selectedKey,
      );
      if (session.selectedLocationId !== locationId) {
        session = await this.sessions.bindSelectedLocation(
          token!,
          session,
          locationId,
        );
      }
    }

    return {
      context: {
        ...context,
        locationId: session.selectedLocationId,
        voiceSessionId: session.sessionId,
      },
      session,
      token: token!,
    };
  }

  async bindLocation(
    resolved: ResolvedVoiceToolSession,
    locationId: string,
  ): Promise<void> {
    if (resolved.session.selectedLocationId === locationId) return;
    resolved.session = await this.sessions.bindSelectedLocation(
      resolved.token,
      resolved.session,
      locationId,
    );
    resolved.context.locationId = locationId;
  }
}
