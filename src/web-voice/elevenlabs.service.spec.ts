import {
  BadGatewayException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ElevenLabsService } from './elevenlabs.service';

describe('ElevenLabsService', () => {
  const originalFetch = global.fetch;
  afterEach(() => {
    global.fetch = originalFetch;
    jest.restoreAllMocks();
  });

  it('calls the official endpoint with server-held credentials', async () => {
    const fetchMock = jest.fn().mockResolvedValue({
      ok: true,
      json: jest.fn().mockResolvedValue({ signed_url: 'wss://signed' }),
    });
    global.fetch = fetchMock as never;
    const service = new ElevenLabsService({
      get: jest.fn().mockReturnValue('private-api-key'),
    } as never);
    await expect(service.getSignedConversationUrl('agent_123')).resolves.toBe(
      'wss://signed',
    );
    const [url, init] = fetchMock.mock.calls[0] as unknown as [
      URL,
      RequestInit,
    ];
    expect(url.origin + url.pathname).toBe(
      'https://api.elevenlabs.io/v1/convai/conversation/get-signed-url',
    );
    expect(url.searchParams.get('agent_id')).toBe('agent_123');
    expect(init.headers).toMatchObject({ 'xi-api-key': 'private-api-key' });
  });

  it('fails safely when the API key is missing', async () => {
    const service = new ElevenLabsService({ get: jest.fn() } as never);
    await expect(
      service.getSignedConversationUrl('agent'),
    ).rejects.toBeInstanceOf(ServiceUnavailableException);
  });

  it.each([
    { ok: false, json: jest.fn() },
    {
      ok: true,
      json: jest.fn().mockResolvedValue({ raw_provider_error: 'secret' }),
    },
  ])('maps provider failures to a safe 502', async (response) => {
    global.fetch = jest.fn().mockResolvedValue(response) as never;
    const service = new ElevenLabsService({
      get: jest.fn().mockReturnValue('private-api-key'),
    } as never);
    await expect(
      service.getSignedConversationUrl('agent'),
    ).rejects.toMatchObject({
      constructor: BadGatewayException,
      response: {
        message: 'Voice service is temporarily unavailable. Please try again.',
        statusCode: 502,
      },
    });
  });
});
