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
});
