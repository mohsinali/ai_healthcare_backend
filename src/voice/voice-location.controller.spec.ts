import { BadRequestException, NotFoundException } from '@nestjs/common';
import { IS_PUBLIC_KEY } from '../auth/decorators/public.decorator';
import { VoiceServiceAuthGuard } from './auth/voice-service-auth.guard';
import { VoiceLocationController } from './voice-location.controller';

describe('VoiceLocationController', () => {
  const widgetKey = `wgt_${'a'.repeat(43)}`;

  it('is public only to clinic JWT auth and requires machine auth', () => {
    expect(Reflect.getMetadata(IS_PUBLIC_KEY, VoiceLocationController)).toBe(
      true,
    );
    expect(
      Reflect.getMetadata('__guards__', VoiceLocationController),
    ).toContain(VoiceServiceAuthGuard);
  });

  it('rejects missing/malformed routing and unavailable channels', async () => {
    const resolveContext = jest.fn();
    const controller = new VoiceLocationController(
      { resolve: resolveContext } as never,
      {} as never,
    );
    await expect(
      controller.resolve(undefined, { query: 'Clifton' }),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      controller.resolve('tenant-a', { query: 'Clifton' }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(resolveContext).not.toHaveBeenCalled();

    resolveContext.mockResolvedValue(null);
    await expect(
      controller.resolve(widgetKey, { query: 'Clifton' }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('passes only trusted context and the query to the service', async () => {
    const context = { tenantId: 'trusted-tenant', locationId: null };
    const resolveLocation = jest
      .fn()
      .mockResolvedValue({ resolved: false, ambiguous: false, matches: [] });
    const controller = new VoiceLocationController(
      { resolve: jest.fn().mockResolvedValue(context) } as never,
      { resolve: resolveLocation } as never,
    );
    await controller.resolve(widgetKey, { query: 'Clifton' });
    expect(resolveLocation).toHaveBeenCalledWith(context, 'Clifton');
  });
});
