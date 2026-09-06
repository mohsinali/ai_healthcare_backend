import {
  ForbiddenException,
  HttpException,
  HttpStatus,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectThrottlerStorage, ThrottlerStorage } from '@nestjs/throttler';
import { createHash } from 'crypto';
import { ElevenLabsService } from './elevenlabs.service';
import { WebVoiceChannelResolverService } from './web-voice-channel-resolver.service';
import { VoiceSessionService } from '../voice-session/voice-session.service';
import { isWebOriginAllowed, normalizeWebOrigin } from './web-origin-policy';

const EXTERNAL_UNAVAILABLE = 'Web voice widget is unavailable.';
const WIDGET_LIMIT = 60;
const IP_LIMIT = 20;
const LIMIT_TTL_MS = 60_000;

@Injectable()
export class WebVoiceSessionService {
  private readonly logger = new Logger(WebVoiceSessionService.name);

  constructor(
    private readonly resolver: WebVoiceChannelResolverService,
    private readonly elevenLabs: ElevenLabsService,
    private readonly config: ConfigService,
    private readonly voiceSessions: VoiceSessionService,
    @InjectThrottlerStorage()
    private readonly throttleStorage: ThrottlerStorage,
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

  async createExternal(
    widgetKey: string,
    originHeader: string | string[] | undefined,
    clientIp: string,
  ) {
    const origin = this.requireSingleCanonicalOrigin(originHeader);
    const resolved = await this.resolver.resolveForExternal(widgetKey);
    if (!resolved || !isWebOriginAllowed(origin, resolved.allowedOrigins)) {
      this.logger.warn({
        event: 'external_web_voice_session_rejected',
        widgetKeyFingerprint: this.fingerprint(widgetKey),
      });
      throw new ForbiddenException(EXTERNAL_UNAVAILABLE);
    }
    const { context } = resolved;

    await this.enforceExternalLimits(clientIp, widgetKey);
    const agentId =
      context.agentId ?? this.config.get<string>('ELEVENLABS_AGENT_ID')?.trim();
    if (!agentId) {
      throw new ServiceUnavailableException('Voice service is not configured.');
    }

    // Sign before Redis commit so provider failures cannot orphan live sessions.
    const signedUrl = await this.elevenLabs.getSignedConversationUrl(agentId);
    const { token, session } = await this.voiceSessions.create({
      tenantId: context.tenantId,
      channel: context.channel,
      channelIdentity: context.webVoiceChannelId,
      selectedLocationId: context.locationId,
      embeddingOrigin: origin,
    });
    return {
      signedUrl,
      voiceSessionToken: token,
      expiresIn: Math.max(
        0,
        Math.round((Date.parse(session.expiresAt) - Date.now()) / 1_000),
      ),
      context: {
        tenantName: context.tenantName,
        locationKey: context.locationKey ?? null,
        locationName: context.locationName,
        locationTimezone: context.locationId ? context.timezone : null,
        locationResolved: context.locationId !== null,
        channel: context.channel,
      },
    };
  }

  private requireSingleCanonicalOrigin(
    value: string | string[] | undefined,
  ): string {
    if (typeof value !== 'string' || value.includes(',')) {
      throw new ForbiddenException(EXTERNAL_UNAVAILABLE);
    }
    try {
      return normalizeWebOrigin(value);
    } catch {
      throw new ForbiddenException(EXTERNAL_UNAVAILABLE);
    }
  }

  private async enforceExternalLimits(clientIp: string, widgetKey: string) {
    const keys: Array<[string, number]> = [
      [`external-widget:ip:${this.fingerprint(clientIp)}`, IP_LIMIT],
      [`external-widget:key:${this.fingerprint(widgetKey)}`, WIDGET_LIMIT],
    ];
    for (const [key, limit] of keys) {
      const result = await this.throttleStorage.increment(
        key,
        LIMIT_TTL_MS,
        limit,
        LIMIT_TTL_MS,
        'external-widget',
      );
      if (result.isBlocked) {
        throw new HttpException(
          'Too many requests.',
          HttpStatus.TOO_MANY_REQUESTS,
        );
      }
    }
  }

  private fingerprint(value: string): string {
    return createHash('sha256').update(value).digest('hex');
  }
}
