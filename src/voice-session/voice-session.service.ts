import {
  Injectable,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash, randomBytes, randomUUID, timingSafeEqual } from 'crypto';
import { RedisService } from '../redis/redis.service';
import { VoiceChannel } from '../voice/context/voice-context';
import {
  VOICE_SESSION_TOKEN_PATTERN,
  VoiceSessionRecord,
} from './voice-session.types';

const KEY_PREFIX = 'voice:session:v1:';
const INVALID_SESSION = 'Voice session is invalid or expired.';

@Injectable()
export class VoiceSessionService {
  private readonly ttlSeconds: number;

  constructor(
    private readonly redis: RedisService,
    config: ConfigService,
  ) {
    this.ttlSeconds = config.getOrThrow<number>('VOICE_SESSION_TTL_SECONDS');
  }

  async create(input: {
    tenantId: string;
    channel: VoiceChannel;
    channelIdentity: string;
    selectedLocationId: string | null;
  }): Promise<{ token: string; session: VoiceSessionRecord }> {
    const token = randomBytes(32).toString('base64url');
    const now = new Date();
    const session: VoiceSessionRecord = {
      stateVersion: 1,
      sessionId: randomUUID(),
      ...input,
      createdAt: now.toISOString(),
      expiresAt: new Date(
        now.getTime() + this.ttlSeconds * 1_000,
      ).toISOString(),
    };
    await this.redis.execute(async (client) => {
      const result = await client.set(
        this.key(token),
        JSON.stringify(session),
        {
          EX: this.ttlSeconds,
          NX: true,
        },
      );
      if (result !== 'OK')
        throw new ServiceUnavailableException(
          'Transient session service is unavailable.',
        );
    });
    return { token, session };
  }

  async resolve(token: string | undefined): Promise<VoiceSessionRecord> {
    if (!token || !VOICE_SESSION_TOKEN_PATTERN.test(token)) this.invalid();
    const value = await this.redis.execute((client) =>
      client.get(this.key(token)),
    );
    if (!value) this.invalid();
    const session = this.parse(value);
    if (Date.parse(session.expiresAt) <= Date.now()) this.invalid();
    return session;
  }

  async bindSelectedLocation(
    token: string,
    expected: VoiceSessionRecord,
    locationId: string,
  ): Promise<VoiceSessionRecord> {
    const updated = { ...expected, selectedLocationId: locationId };
    const expiresAtMs = Date.parse(expected.expiresAt);
    if (expiresAtMs <= Date.now()) this.invalid();
    const result = await this.redis.execute((client) =>
      client.eval(
        `local current = redis.call('GET', KEYS[1])
         if not current or current ~= ARGV[1] then return 0 end
         redis.call('SET', KEYS[1], ARGV[2])
         redis.call('PEXPIREAT', KEYS[1], ARGV[3])
         return 1`,
        {
          keys: [this.key(token)],
          arguments: [
            JSON.stringify(expected),
            JSON.stringify(updated),
            String(expiresAtMs),
          ],
        },
      ),
    );
    if (result !== 1) this.invalid();
    return updated;
  }

  private key(token: string): string {
    return `${KEY_PREFIX}${createHash('sha256').update(token).digest('hex')}`;
  }

  private parse(value: string): VoiceSessionRecord {
    try {
      const item = JSON.parse(value) as Partial<VoiceSessionRecord>;
      if (
        item.stateVersion !== 1 ||
        typeof item.sessionId !== 'string' ||
        typeof item.tenantId !== 'string' ||
        !Object.values(VoiceChannel).includes(item.channel as VoiceChannel) ||
        typeof item.channelIdentity !== 'string' ||
        !(
          typeof item.selectedLocationId === 'string' ||
          item.selectedLocationId === null
        ) ||
        typeof item.createdAt !== 'string' ||
        typeof item.expiresAt !== 'string'
      )
        this.invalid();
      return item as VoiceSessionRecord;
    } catch (error) {
      if (error instanceof UnauthorizedException) throw error;
      this.invalid();
    }
  }

  assertMatches(
    session: VoiceSessionRecord,
    tenantId: string,
    channel: VoiceChannel,
    channelIdentity: string,
  ): void {
    const sameIdentity =
      Buffer.byteLength(session.channelIdentity) ===
        Buffer.byteLength(channelIdentity) &&
      timingSafeEqual(
        Buffer.from(session.channelIdentity),
        Buffer.from(channelIdentity),
      );
    if (
      session.tenantId !== tenantId ||
      session.channel !== channel ||
      !sameIdentity
    )
      this.invalid();
  }

  private invalid(): never {
    throw new UnauthorizedException(INVALID_SESSION);
  }
}
