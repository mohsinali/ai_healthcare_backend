import {
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { VoiceChannel } from '../voice/context/voice-context';
import { VoiceSessionService } from './voice-session.service';

describe('VoiceSessionService', () => {
  let store: Map<string, string>;
  let expiries: Map<string, number>;
  let client: {
    set: jest.Mock;
    get: jest.Mock;
    eval: jest.Mock;
  };
  let redis: { execute: jest.Mock };
  let service: VoiceSessionService;

  beforeEach(() => {
    store = new Map();
    expiries = new Map();
    client = {
      set: jest.fn((key: string, value: string, options: { EX: number }) => {
        store.set(key, value);
        expiries.set(key, Date.now() + options.EX * 1_000);
        return Promise.resolve('OK');
      }),
      get: jest.fn((key: string) => {
        if ((expiries.get(key) ?? 0) <= Date.now()) {
          store.delete(key);
          return Promise.resolve(null);
        }
        return Promise.resolve(store.get(key) ?? null);
      }),
      eval: jest.fn(
        (_script: string, input: { keys: string[]; arguments: string[] }) => {
          const [key] = input.keys;
          const [expected, updated, expiresAt] = input.arguments;
          if (store.get(key) !== expected) return Promise.resolve(0);
          store.set(key, updated);
          expiries.set(key, Number(expiresAt));
          return Promise.resolve(1);
        },
      ),
    };
    redis = {
      // eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-return
      execute: jest.fn((operation) => operation(client)),
    };
    service = new VoiceSessionService(
      redis as never,
      {
        getOrThrow: jest.fn().mockReturnValue(1800),
      } as never,
    );
  });

  const create = () =>
    service.create({
      tenantId: 'tenant-a',
      channel: VoiceChannel.WEB_WIDGET,
      channelIdentity: 'widget-channel-a',
      selectedLocationId: null,
    });

  it('creates unique 256-bit credentials and stores only their SHA-256 lookup digest', async () => {
    const first = await create();
    const second = await create();
    expect(first.token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(second.token).not.toBe(first.token);
    const serializedStore = JSON.stringify([...store.entries()]);
    expect(serializedStore).not.toContain(first.token);
    expect([...store.keys()][0]).toMatch(/^voice:session:v1:[a-f0-9]{64}$/);
    expect(first.session.sessionId).not.toBe(second.session.sessionId);
  });

  it.each([undefined, '', 'short', 'a'.repeat(44)])(
    'rejects missing or malformed tokens',
    async (token) => {
      await expect(service.resolve(token)).rejects.toBeInstanceOf(
        UnauthorizedException,
      );
    },
  );

  it('resolves valid sessions and rejects unknown or expired sessions without extending expiry', async () => {
    const { token, session } = await create();
    const key = [...store.keys()][0];
    const originalExpiry = expiries.get(key);
    await expect(service.resolve(token)).resolves.toEqual(session);
    expect(expiries.get(key)).toBe(originalExpiry);
    await expect(service.resolve('x'.repeat(43))).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
    expiries.set(key, Date.now() - 1);
    await expect(service.resolve(token)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  it('updates selected location without extending absolute expiry and isolates sessions', async () => {
    const first = await create();
    const second = await create();
    const firstKey = [...store.keys()][0];
    const expiry = expiries.get(firstKey);
    await service.bindSelectedLocation(
      first.token,
      first.session,
      'location-a',
    );
    expect((await service.resolve(first.token)).selectedLocationId).toBe(
      'location-a',
    );
    expect((await service.resolve(second.token)).selectedLocationId).toBeNull();
    expect(expiries.get(firstKey)).toBe(expiry);
  });

  it('rejects tenant, channel, and widget mismatches generically', async () => {
    const { session } = await create();
    expect(() =>
      service.assertMatches(
        session,
        'tenant-b',
        VoiceChannel.WEB_WIDGET,
        'widget-channel-a',
      ),
    ).toThrow(UnauthorizedException);
    expect(() =>
      service.assertMatches(
        session,
        'tenant-a',
        VoiceChannel.WEB_WIDGET,
        'widget-channel-b',
      ),
    ).toThrow(UnauthorizedException);
    expect(() =>
      service.assertMatches(
        session,
        'tenant-a',
        VoiceChannel.PHONE,
        'widget-channel-a',
      ),
    ).toThrow(UnauthorizedException);
  });

  it('fails closed when Redis is unavailable', async () => {
    redis.execute.mockRejectedValueOnce(
      new ServiceUnavailableException(
        'Transient session service is unavailable.',
      ),
    );
    await expect(create()).rejects.toBeInstanceOf(ServiceUnavailableException);
  });

  it('fails closed when Redis is unavailable during patient-state updates', async () => {
    redis.execute.mockRejectedValue(
      new ServiceUnavailableException(
        'Transient session service is unavailable.',
      ),
    );
    await expect(
      service.replacePatientCandidates('x'.repeat(43), ['patient-a']),
    ).rejects.toBeInstanceOf(ServiceUnavailableException);
    await expect(
      service.applyPatientVerification('x'.repeat(43), 1, null),
    ).rejects.toBeInstanceOf(ServiceUnavailableException);
  });
});
