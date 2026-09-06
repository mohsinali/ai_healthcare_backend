import {
  BadGatewayException,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { VoiceChannel } from '../voice/context/voice-context';
import { WebVoiceSessionService } from './web-voice-session.service';

describe('WebVoiceSessionService', () => {
  const context = {
    channel: VoiceChannel.WEB_WIDGET,
    webVoiceChannelId: 'channel',
    agentId: null,
    tenantId: 'tenant',
    tenantName: 'Clinic',
    locationId: 'location',
    locationKey: 'LOC-001',
    locationName: 'Downtown',
    timezone: 'UTC',
    escalationPhoneNumber: null,
  };
  const create = (resolved: unknown = context, defaultAgent?: string) => {
    const resolve = jest.fn().mockResolvedValue(resolved);
    const resolveForExternal = jest.fn().mockResolvedValue(
      resolved
        ? {
            context: resolved,
            allowedOrigins: (resolved as { allowedOrigins?: string[] })
              .allowedOrigins ?? ['https://clinic.example'],
          }
        : null,
    );
    const getSignedConversationUrl = jest
      .fn()
      .mockResolvedValue('wss://signed.example/token');
    const config = {
      get: jest.fn((key: string) =>
        key === 'ELEVENLABS_AGENT_ID' ? defaultAgent : undefined,
      ),
    };
    const createSession = jest.fn().mockResolvedValue({
      token: 't'.repeat(43),
      session: { expiresAt: new Date(Date.now() + 900_000).toISOString() },
    });
    const increment = jest.fn().mockResolvedValue({ isBlocked: false });
    return {
      service: new WebVoiceSessionService(
        { resolve, resolveForExternal } as never,
        { getSignedConversationUrl } as never,
        config as never,
        { create: createSession } as never,
        { increment },
      ),
      resolve,
      resolveForExternal,
      getSignedConversationUrl,
      createSession,
      increment,
    };
  };

  it('uses the environment agent and returns only narrow public context', async () => {
    const { service, getSignedConversationUrl } = create(
      context,
      'agent_default',
    );
    const result = await service.create(`wgt_${'a'.repeat(43)}`);
    expect(getSignedConversationUrl).toHaveBeenCalledWith('agent_default');
    expect(result).toEqual({
      signedUrl: 'wss://signed.example/token',
      voiceSessionToken: 't'.repeat(43),
      context: {
        tenantName: 'Clinic',
        locationKey: 'LOC-001',
        locationName: 'Downtown',
        locationTimezone: 'UTC',
        locationResolved: true,
        channel: VoiceChannel.WEB_WIDGET,
      },
    });
    expect(JSON.stringify(result)).not.toMatch(
      /tenantId|locationId|apiKey|patient|appointment/i,
    );
  });

  it('prefers the channel agent override', async () => {
    const { service, getSignedConversationUrl } = create(
      { ...context, agentId: 'agent_override' },
      'agent_default',
    );
    await service.create(`wgt_${'a'.repeat(43)}`);
    expect(getSignedConversationUrl).toHaveBeenCalledWith('agent_override');
  });

  it('fails before provider calls for unavailable channels or missing agent config', async () => {
    const unavailable = create(null, 'agent_default');
    await expect(unavailable.service.create('invalid')).rejects.toBeInstanceOf(
      NotFoundException,
    );
    expect(unavailable.getSignedConversationUrl).not.toHaveBeenCalled();
    const missing = create(context);
    await expect(
      missing.service.create(`wgt_${'a'.repeat(43)}`),
    ).rejects.toBeInstanceOf(ServiceUnavailableException);
    expect(missing.getSignedConversationUrl).not.toHaveBeenCalled();
  });

  it('preserves safe provider errors', async () => {
    const fixture = create(context, 'agent_default');
    fixture.getSignedConversationUrl.mockRejectedValue(
      new BadGatewayException(
        'Voice service is temporarily unavailable. Please try again.',
      ),
    );
    await expect(
      fixture.service.create(`wgt_${'a'.repeat(43)}`),
    ).rejects.toMatchObject({ response: { statusCode: 502 } });
  });

  it('authorizes and binds the canonical external origin', async () => {
    const fixture = create(context, 'agent_default');
    const result = await fixture.service.createExternal(
      `wgt_${'a'.repeat(43)}`,
      'HTTPS://CLINIC.EXAMPLE:443',
      '203.0.113.4',
    );
    expect(fixture.createSession).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: 'tenant',
        channelIdentity: 'channel',
        embeddingOrigin: 'https://clinic.example',
      }),
    );
    expect(fixture.increment).toHaveBeenCalledTimes(2);
    expect(result).toMatchObject({
      signedUrl: 'wss://signed.example/token',
      voiceSessionToken: 't'.repeat(43),
      expiresIn: expect.any(Number) as number,
    });
    expect(JSON.stringify(result)).not.toMatch(
      /tenantId|channelIdentity|allowedOrigins|embeddingOrigin/i,
    );
  });

  it.each([
    undefined,
    ['https://clinic.example', 'https://evil.example'],
    'https://clinic.example, https://evil.example',
    'null',
    'not-an-origin',
  ])(
    'rejects an invalid Origin before lookup or side effects',
    async (origin) => {
      const fixture = create(context, 'agent_default');
      await expect(
        fixture.service.createExternal(
          `wgt_${'a'.repeat(43)}`,
          origin,
          '203.0.113.4',
        ),
      ).rejects.toMatchObject({ response: { statusCode: 403 } });
      expect(fixture.resolveForExternal).not.toHaveBeenCalled();
      expect(fixture.getSignedConversationUrl).not.toHaveBeenCalled();
      expect(fixture.createSession).not.toHaveBeenCalled();
    },
  );

  it.each([
    ['https://evil.example', context],
    ['http://clinic.example', context],
    ['https://clinic.example:444', context],
    ['https://sub.clinic.example', context],
    ['https://clinic.example.evil.test', context],
    ['https://clinic.example', { ...context, allowedOrigins: [] }],
    ['https://clinic.example', null],
  ])(
    'uses one generic rejection without creating credentials',
    async (origin, resolved) => {
      const fixture = create(resolved, 'agent_default');
      await expect(
        fixture.service.createExternal(
          `wgt_${'a'.repeat(43)}`,
          origin,
          '203.0.113.4',
        ),
      ).rejects.toMatchObject({
        response: {
          statusCode: 403,
          message: 'Web voice widget is unavailable.',
        },
      });
      expect(fixture.getSignedConversationUrl).not.toHaveBeenCalled();
      expect(fixture.createSession).not.toHaveBeenCalled();
    },
  );

  it('does not create Redis state when signed URL generation fails', async () => {
    const fixture = create(context, 'agent_default');
    fixture.getSignedConversationUrl.mockRejectedValue(
      new BadGatewayException('Voice service is temporarily unavailable.'),
    );
    await expect(
      fixture.service.createExternal(
        `wgt_${'a'.repeat(43)}`,
        'https://clinic.example',
        '203.0.113.4',
      ),
    ).rejects.toMatchObject({ response: { statusCode: 502 } });
    expect(fixture.createSession).not.toHaveBeenCalled();
  });

  it('applies the focused limiter after authorization', async () => {
    const fixture = create(context, 'agent_default');
    fixture.increment.mockResolvedValueOnce({ isBlocked: true });
    await expect(
      fixture.service.createExternal(
        `wgt_${'a'.repeat(43)}`,
        'https://clinic.example',
        '203.0.113.4',
      ),
    ).rejects.toMatchObject({ status: 429 });
    expect(fixture.getSignedConversationUrl).not.toHaveBeenCalled();
    expect(fixture.createSession).not.toHaveBeenCalled();
  });
});
