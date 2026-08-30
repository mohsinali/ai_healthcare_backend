import { BadRequestException } from '@nestjs/common';
import { IS_PUBLIC_KEY } from '../auth/decorators/public.decorator';
import { VoiceServiceAuthGuard } from './auth/voice-service-auth.guard';
import { VoiceDirectoryController } from './voice-directory.controller';

describe('VoiceDirectoryController', () => {
  const widgetKey = `wgt_${'a'.repeat(43)}`;

  it('uses the established machine authentication boundary', () => {
    expect(Reflect.getMetadata(IS_PUBLIC_KEY, VoiceDirectoryController)).toBe(
      true,
    );
    expect(
      Reflect.getMetadata('__guards__', VoiceDirectoryController),
    ).toContain(VoiceServiceAuthGuard);
  });

  it('rejects malformed routing before resolving context', async () => {
    const resolve = jest.fn();
    const controller = new VoiceDirectoryController(
      { resolve } as never,
      {} as never,
      {} as never,
    );
    await expect(
      controller.searchServices('tenant-a', undefined, {}),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(resolve).not.toHaveBeenCalled();
  });

  it('passes only trusted context and a tenant-validated selected location', async () => {
    const context = { tenantId: 'tenant-a', locationId: 'default-location' };
    const searchServices = jest.fn().mockResolvedValue({ services: [] });
    const searchProviders = jest.fn().mockResolvedValue({ providers: [] });
    const selectedResolve = jest.fn().mockResolvedValue('selected-location');
    const controller = new VoiceDirectoryController(
      { resolve: jest.fn().mockResolvedValue(context) } as never,
      { searchServices, searchProviders } as never,
      { resolve: selectedResolve } as never,
    );
    await controller.searchServices(widgetKey, ' LOC-002 ', { query: 'care' });
    await controller.searchProviders(widgetKey, 'LOC-002', {
      query: 'Sarah',
      serviceName: 'Consultation',
    });
    expect(selectedResolve).toHaveBeenCalledWith('tenant-a', 'LOC-002');
    expect(searchServices).toHaveBeenCalledWith(
      context,
      'care',
      'selected-location',
    );
    expect(searchProviders).toHaveBeenCalledWith(
      context,
      { query: 'Sarah', serviceName: 'Consultation' },
      'selected-location',
    );
  });
});
