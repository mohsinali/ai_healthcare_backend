import { IS_PUBLIC_KEY } from '../auth/decorators/public.decorator';
import { VoiceServiceAuthGuard } from './auth/voice-service-auth.guard';
import { VoiceDirectoryController } from './voice-directory.controller';

describe('VoiceDirectoryController', () => {
  it('requires machine auth and scopes tools to the trusted session location', async () => {
    expect(Reflect.getMetadata(IS_PUBLIC_KEY, VoiceDirectoryController)).toBe(
      true,
    );
    expect(
      Reflect.getMetadata('__guards__', VoiceDirectoryController),
    ).toContain(VoiceServiceAuthGuard);
    const context = { tenantId: 'tenant', voiceSessionId: 'session' };
    const resolve = jest.fn().mockResolvedValue({
      context,
      session: { selectedLocationId: 'location' },
    });
    const searchServices = jest.fn().mockResolvedValue({ services: [] });
    const controller = new VoiceDirectoryController(
      { searchServices } as never,
      { resolve } as never,
      {} as never,
      {} as never,
    );
    await controller.searchServices('widget', 'LOC-1', 'token', {
      query: 'care',
    });
    expect(resolve).toHaveBeenCalledWith('token', 'widget', 'LOC-1');
    expect(searchServices).toHaveBeenCalledWith(context, 'care', 'location');
  });
});
