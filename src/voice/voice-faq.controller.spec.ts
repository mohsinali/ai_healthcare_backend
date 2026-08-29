import { BadRequestException, NotFoundException } from '@nestjs/common';
import { IS_PUBLIC_KEY } from '../auth/decorators/public.decorator';
import { VoiceServiceAuthGuard } from './auth/voice-service-auth.guard';
import { VoiceFaqController } from './voice-faq.controller';

describe('VoiceFaqController', () => {
  const widgetKey = `wgt_${'a'.repeat(43)}`;

  it('is public only to clinic JWT auth and requires machine auth', () => {
    expect(Reflect.getMetadata(IS_PUBLIC_KEY, VoiceFaqController)).toBe(true);
    expect(Reflect.getMetadata('__guards__', VoiceFaqController)).toContain(
      VoiceServiceAuthGuard,
    );
  });

  it('rejects a missing or malformed routing header before resolution', async () => {
    const resolve = jest.fn();
    const controller = new VoiceFaqController(
      { resolve } as never,
      {} as never,
    );
    await expect(
      controller.search(undefined, { query: 'parking' }),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      controller.search('tenant-a', { query: 'parking' }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(resolve).not.toHaveBeenCalled();
  });

  it('rejects unknown or inactive channels safely', async () => {
    const controller = new VoiceFaqController(
      { resolve: jest.fn().mockResolvedValue(null) } as never,
      {} as never,
    );
    await expect(
      controller.search(widgetKey, { query: 'parking' }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('passes only resolved VoiceContext and query to business logic', async () => {
    const context = { tenantId: 'trusted-tenant', locationId: null };
    const search = jest.fn().mockResolvedValue({ found: false, matches: [] });
    const controller = new VoiceFaqController(
      { resolve: jest.fn().mockResolvedValue(context) } as never,
      { search } as never,
    );
    await controller.search(widgetKey, { query: 'parking' });
    expect(search).toHaveBeenCalledWith(context, 'parking');
  });
});
