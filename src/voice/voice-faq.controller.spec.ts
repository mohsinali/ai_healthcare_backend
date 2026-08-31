import { IS_PUBLIC_KEY } from '../auth/decorators/public.decorator';
import { VoiceServiceAuthGuard } from './auth/voice-service-auth.guard';
import { VoiceFaqController } from './voice-faq.controller';

describe('VoiceFaqController', () => {
  it('requires machine auth and uses the Redis session location', async () => {
    expect(Reflect.getMetadata(IS_PUBLIC_KEY, VoiceFaqController)).toBe(true);
    expect(Reflect.getMetadata('__guards__', VoiceFaqController)).toContain(
      VoiceServiceAuthGuard,
    );
    const context = {
      tenantId: 'tenant',
      locationId: 'location',
      voiceSessionId: 'session',
    };
    const resolve = jest.fn().mockResolvedValue({
      context,
      session: { selectedLocationId: 'location' },
    });
    const search = jest.fn().mockResolvedValue({ matches: [] });
    const controller = new VoiceFaqController(
      { search } as never,
      { resolve } as never,
    );
    await controller.search('widget', undefined, 'token', { query: 'parking' });
    expect(resolve).toHaveBeenCalledWith('token', 'widget', undefined);
    expect(search).toHaveBeenCalledWith(context, 'parking', 'location');
  });
});
