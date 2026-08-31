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
    const getSignedConversationUrl = jest
      .fn()
      .mockResolvedValue('wss://signed.example/token');
    const config = {
      get: jest.fn((key: string) =>
        key === 'ELEVENLABS_AGENT_ID' ? defaultAgent : undefined,
      ),
    };
    const createSession = jest
      .fn()
      .mockResolvedValue({ token: 't'.repeat(43) });
    return {
      service: new WebVoiceSessionService(
        { resolve } as never,
        { getSignedConversationUrl } as never,
        config as never,
        { create: createSession } as never,
      ),
      resolve,
      getSignedConversationUrl,
      createSession,
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
});
