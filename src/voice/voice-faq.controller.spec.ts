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
      {} as never,
    );
    await expect(
      controller.search(undefined, undefined, { query: 'parking' }),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      controller.search('tenant-a', undefined, { query: 'parking' }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(resolve).not.toHaveBeenCalled();
  });

  it('rejects unknown or inactive channels safely', async () => {
    const controller = new VoiceFaqController(
      { resolve: jest.fn().mockResolvedValue(null) } as never,
      {} as never,
      {} as never,
    );
    await expect(
      controller.search(widgetKey, undefined, { query: 'parking' }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('uses the widget default when the selected-location header is absent', async () => {
    const context = { tenantId: 'trusted-tenant', locationId: 'clifton-id' };
    const search = jest.fn().mockResolvedValue({ found: false, matches: [] });
    const resolveSelected = jest.fn();
    const controller = new VoiceFaqController(
      { resolve: jest.fn().mockResolvedValue(context) } as never,
      { search } as never,
      { resolve: resolveSelected } as never,
    );
    await controller.search(widgetKey, undefined, { query: 'parking' });
    expect(resolveSelected).not.toHaveBeenCalled();
    expect(search).toHaveBeenCalledWith(context, 'parking', 'clifton-id');
  });

  it('treats a blank selected-location header as unset', async () => {
    const context = { tenantId: 'trusted-tenant', locationId: null };
    const search = jest.fn().mockResolvedValue({ found: false, matches: [] });
    const resolveSelected = jest.fn();
    const controller = new VoiceFaqController(
      { resolve: jest.fn().mockResolvedValue(context) } as never,
      { search } as never,
      { resolve: resolveSelected } as never,
    );
    await controller.search(widgetKey, '   ', { query: 'parking' });
    expect(resolveSelected).not.toHaveBeenCalled();
    expect(search).toHaveBeenCalledWith(context, 'parking', null);
  });

  it('validates and uses a selected location without changing trusted tenant context', async () => {
    const context = { tenantId: 'trusted-tenant', locationId: 'clifton-id' };
    const search = jest.fn().mockResolvedValue({ found: false, matches: [] });
    const resolveSelected = jest.fn().mockResolvedValue('gulshan-id');
    const controller = new VoiceFaqController(
      { resolve: jest.fn().mockResolvedValue(context) } as never,
      { search } as never,
      { resolve: resolveSelected } as never,
    );

    await controller.search(widgetKey, ' GLN-002 ', { query: 'parking' });

    expect(resolveSelected).toHaveBeenCalledWith('trusted-tenant', 'GLN-002');
    expect(search).toHaveBeenCalledWith(context, 'parking', 'gulshan-id');
    expect(context).toEqual({
      tenantId: 'trusted-tenant',
      locationId: 'clifton-id',
    });
  });

  it('uses the newly selected location on a later FAQ request', async () => {
    const context = { tenantId: 'trusted-tenant', locationId: 'clifton-id' };
    const search = jest.fn().mockResolvedValue({ found: false, matches: [] });
    const resolveSelected = jest
      .fn()
      .mockResolvedValueOnce('clifton-id')
      .mockResolvedValueOnce('gulshan-id');
    const controller = new VoiceFaqController(
      { resolve: jest.fn().mockResolvedValue(context) } as never,
      { search } as never,
      { resolve: resolveSelected } as never,
    );

    await controller.search(widgetKey, 'CLF-001', { query: 'parking' });
    await controller.search(widgetKey, 'GLN-002', { query: 'parking' });

    expect(search).toHaveBeenNthCalledWith(1, context, 'parking', 'clifton-id');
    expect(search).toHaveBeenNthCalledWith(2, context, 'parking', 'gulshan-id');
  });
});
