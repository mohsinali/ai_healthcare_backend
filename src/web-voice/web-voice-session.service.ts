import {
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ElevenLabsService } from './elevenlabs.service';
import { WebVoiceChannelResolverService } from './web-voice-channel-resolver.service';
import { VoiceSessionService } from '../voice-session/voice-session.service';

@Injectable()
export class WebVoiceSessionService {
  private readonly logger = new Logger(WebVoiceSessionService.name);

  constructor(
    private readonly resolver: WebVoiceChannelResolverService,
    private readonly elevenLabs: ElevenLabsService,
    private readonly config: ConfigService,
    private readonly voiceSessions: VoiceSessionService,
  ) {}

  async create(widgetKey: string) {
    const maskedKey = `${widgetKey.slice(0, 8)}...`;
    const context = await this.resolver.resolve(widgetKey);
    if (!context) {
      this.logger.warn({
        event: 'web_voice_session_failed',
        reason: 'unavailable_channel',
        widgetKey: maskedKey,
      });
      throw new NotFoundException('Web voice channel is unavailable.');
    }
    const agentId =
      context.agentId ?? this.config.get<string>('ELEVENLABS_AGENT_ID')?.trim();
    if (!agentId) {
      this.logger.error({
        event: 'web_voice_session_failed',
        reason: 'missing_agent',
        channel: context.channel,
      });
      throw new ServiceUnavailableException('Voice service is not configured.');
    }
    try {
      // Generate on demand and return directly; signed URLs are short-lived
      // startup credentials and must never be cached, persisted, or logged.
      const signedUrl = await this.elevenLabs.getSignedConversationUrl(agentId);
      const { token } = await this.voiceSessions.create({
        tenantId: context.tenantId,
        channel: context.channel,
        channelIdentity: context.webVoiceChannelId,
        selectedLocationId: context.locationId,
      });
      this.logger.log({
        event: 'web_voice_session_created',
        channel: context.channel,
        locationResolved: context.locationId !== null,
      });
      return {
        signedUrl,
        voiceSessionToken: token,
        context: {
          tenantName: context.tenantName,
          locationKey: context.locationKey ?? null,
          locationName: context.locationName,
          locationTimezone: context.locationId ? context.timezone : null,
          locationResolved: context.locationId !== null,
          channel: context.channel,
        },
      };
    } catch (error) {
      this.logger.error({
        event: 'web_voice_session_failed',
        reason: 'provider_unavailable',
        channel: context.channel,
      });
      throw error;
    }
  }
}
