import {
  BadGatewayException,
  Injectable,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class ElevenLabsService {
  private readonly endpoint =
    'https://api.elevenlabs.io/v1/convai/conversation/get-signed-url';

  constructor(private readonly config: ConfigService) {}

  async getSignedConversationUrl(agentId: string): Promise<string> {
    const apiKey = this.config.get<string>('ELEVENLABS_API_KEY')?.trim();
    if (!apiKey)
      throw new ServiceUnavailableException('Voice service is not configured.');

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5_000);
    try {
      const url = new URL(this.endpoint);
      url.searchParams.set('agent_id', agentId);
      const response = await fetch(url, {
        method: 'GET',
        headers: { 'xi-api-key': apiKey, accept: 'application/json' },
        signal: controller.signal,
      });
      if (!response.ok)
        throw new BadGatewayException(
          'Voice service is temporarily unavailable. Please try again.',
        );
      const body = (await response.json()) as { signed_url?: unknown };
      if (typeof body.signed_url !== 'string' || !body.signed_url)
        throw new BadGatewayException(
          'Voice service is temporarily unavailable. Please try again.',
        );
      return body.signed_url;
    } catch (error) {
      if (error instanceof BadGatewayException) throw error;
      throw new BadGatewayException(
        'Voice service is temporarily unavailable. Please try again.',
      );
    } finally {
      clearTimeout(timeout);
    }
  }
}
