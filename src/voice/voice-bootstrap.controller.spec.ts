import {
  ExecutionContext,
  UnauthorizedException,
  ValidationPipe,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { IS_PUBLIC_KEY } from '../auth/decorators/public.decorator';
import { VoiceServiceAuthGuard } from './auth/voice-service-auth.guard';
import { BootstrapVoiceDto } from './dto/bootstrap-voice.dto';
import { VoiceBootstrapController } from './voice-bootstrap.controller';

describe('VoiceBootstrapController security boundary', () => {
  const apiKey = 'voice-gateway-test-key-at-least-32-characters';
  const guard = new VoiceServiceAuthGuard({
    getOrThrow: () => apiKey,
  } as unknown as ConfigService);
  const context = (authorization?: string) =>
    ({
      switchToHttp: () => ({
        getRequest: () => ({ headers: { authorization } }),
      }),
    }) as ExecutionContext;

  it('bypasses user JWT auth only while still requiring machine auth', async () => {
    expect(Reflect.getMetadata(IS_PUBLIC_KEY, VoiceBootstrapController)).toBe(
      true,
    );
    expect(
      Reflect.getMetadata('__guards__', VoiceBootstrapController),
    ).toContain(VoiceServiceAuthGuard);
    expect(() => guard.canActivate(context())).toThrow(UnauthorizedException);
    expect(() =>
      guard.canActivate(context('Bearer header.payload.signature')),
    ).toThrow(UnauthorizedException);
    expect(guard.canActivate(context(`Bearer ${apiKey}`))).toBe(true);

    const bootstrap = jest.fn().mockResolvedValue({
      context: { tenantId: 'tenant-a' },
    });
    const controller = new VoiceBootstrapController({ bootstrap } as never);
    await expect(
      controller.bootstrap({ calledNumber: '+13055551001' }),
    ).resolves.toEqual({ context: { tenantId: 'tenant-a' } });
  });

  it.each(['tenantId', 'locationId'])(
    'rejects request-supplied routing field %s',
    async (field) => {
      const pipe = new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      });
      await expect(
        pipe.transform(
          { calledNumber: '+13055551001', [field]: 'tenant-b' },
          { type: 'body', metatype: BootstrapVoiceDto },
        ),
      ).rejects.toMatchObject({ status: 400 });
    },
  );
});
