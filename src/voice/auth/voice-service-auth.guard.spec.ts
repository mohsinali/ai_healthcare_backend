import { ConfigService } from '@nestjs/config';
import { ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { VoiceServiceAuthGuard } from './voice-service-auth.guard';

describe('VoiceServiceAuthGuard', () => {
  const apiKey = 'voice-gateway-test-key-at-least-32-characters';
  const guard = new VoiceServiceAuthGuard({
    getOrThrow: jest.fn().mockReturnValue(apiKey),
  } as unknown as ConfigService);

  const context = (authorization?: string) =>
    ({
      switchToHttp: () => ({
        getRequest: () => ({ headers: { authorization } }),
      }),
    }) as ExecutionContext;

  it.each([
    undefined,
    `Basic ${apiKey}`,
    'Bearer wrong-machine-key',
    'Bearer',
    `bearer ${apiKey}`,
  ])('rejects an invalid Authorization header: %s', (authorization) => {
    expect(() => guard.canActivate(context(authorization))).toThrow(
      UnauthorizedException,
    );
  });

  it('accepts only the configured machine credential', () => {
    expect(guard.canActivate(context(`Bearer ${apiKey}`))).toBe(true);
  });

  it('does not accept a normal clinic-user JWT or expose the API key', () => {
    try {
      guard.canActivate(context('Bearer header.payload.signature'));
      throw new Error('Expected authentication failure');
    } catch (error) {
      expect(error).toBeInstanceOf(UnauthorizedException);
      expect(JSON.stringify(error)).not.toContain(apiKey);
    }
  });
});
