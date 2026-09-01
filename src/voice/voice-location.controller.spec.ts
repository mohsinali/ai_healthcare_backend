import { IS_PUBLIC_KEY } from '../auth/decorators/public.decorator';
import { VoiceServiceAuthGuard } from './auth/voice-service-auth.guard';
import { VoiceLocationController } from './voice-location.controller';

describe('VoiceLocationController', () => {
  it('binds a resolved active location to only the trusted session', async () => {
    expect(Reflect.getMetadata(IS_PUBLIC_KEY, VoiceLocationController)).toBe(
      true,
    );
    expect(
      Reflect.getMetadata('__guards__', VoiceLocationController),
    ).toContain(VoiceServiceAuthGuard);
    const resolvedSession = { context: { tenantId: 'tenant' } };
    const resolveSession = jest.fn().mockResolvedValue(resolvedSession);
    const bindLocation = jest.fn();
    const resolveLocation = jest.fn().mockResolvedValue({
      resolved: true,
      location: { key: 'LOC-1' },
      matches: [],
    });
    const controller = new VoiceLocationController(
      { resolve: resolveLocation } as never,
      { resolve: resolveSession, bindLocation } as never,
      { resolve: jest.fn().mockResolvedValue('location-id') } as never,
    );
    await controller.resolve('widget', 'token', { query: 'Downtown' });
    expect(resolveSession).toHaveBeenCalledWith('token', 'widget');
    expect(bindLocation).toHaveBeenCalledWith(resolvedSession, 'location-id');
  });

  it.each([
    { resolved: false, ambiguous: false, matches: [] },
    {
      resolved: false,
      ambiguous: true,
      matches: [{ key: 'LOC-1', name: 'Downtown North' }],
    },
  ])('does not bind a failed or ambiguous result', async (result) => {
    const bindLocation = jest.fn();
    const selectedResolve = jest.fn();
    const controller = new VoiceLocationController(
      { resolve: jest.fn().mockResolvedValue(result) } as never,
      {
        resolve: jest.fn().mockResolvedValue({
          context: { tenantId: 'tenant' },
        }),
        bindLocation,
      } as never,
      { resolve: selectedResolve } as never,
    );
    await controller.resolve('widget', 'token', { query: 'Downtown' });
    expect(selectedResolve).not.toHaveBeenCalled();
    expect(bindLocation).not.toHaveBeenCalled();
  });

  it('fails closed when persisting the selected location is unavailable', async () => {
    const controller = new VoiceLocationController(
      {
        resolve: jest.fn().mockResolvedValue({
          resolved: true,
          location: { key: 'LOC-1' },
          matches: [],
        }),
      } as never,
      {
        resolve: jest.fn().mockResolvedValue({
          context: { tenantId: 'tenant' },
        }),
        bindLocation: jest
          .fn()
          .mockRejectedValue(new Error('session store unavailable')),
      } as never,
      { resolve: jest.fn().mockResolvedValue('location-id') } as never,
    );

    await expect(
      controller.resolve('widget', 'token', { query: 'Downtown' }),
    ).rejects.toThrow('session store unavailable');
  });
});
