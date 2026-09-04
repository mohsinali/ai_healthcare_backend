import { IS_PUBLIC_KEY } from '../auth/decorators/public.decorator';
import { VoiceServiceAuthGuard } from './auth/voice-service-auth.guard';
import { VoiceDirectoryController } from './voice-directory.controller';

/* Controller method references are inspected as metadata targets, never invoked. */
/* eslint-disable @typescript-eslint/unbound-method */

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
    const reschedule = jest.fn().mockResolvedValue({ status: 'ok' });
    const controller = new VoiceDirectoryController(
      { searchServices } as never,
      { resolve } as never,
      {} as never,
      {} as never,
      {} as never,
      { reschedule } as never,
    );
    await controller.searchServices('widget', 'LOC-1', 'token', {
      query: 'care',
    });
    expect(resolve).toHaveBeenCalledWith('token', 'widget', 'LOC-1');
    expect(searchServices).toHaveBeenCalledWith(context, 'care', 'location');
    await controller.rescheduleAppointment('widget', 'token', {
      appointmentDate: '2026-09-12',
      startTime: '14:30',
      confirmed: true,
    });
    expect(resolve).toHaveBeenLastCalledWith('token', 'widget');
    expect(reschedule).toHaveBeenCalledWith(
      expect.objectContaining({ context }),
      expect.objectContaining({ confirmed: true }),
    );
    expect(
      Reflect.getMetadata(
        'THROTTLER:LIMITdefault',
        VoiceDirectoryController.prototype.rescheduleAppointment,
      ),
    ).toBe(10);
  });
});
