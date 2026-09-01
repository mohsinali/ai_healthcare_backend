import { IS_PUBLIC_KEY } from '../auth/decorators/public.decorator';
import { VoiceServiceAuthGuard } from './auth/voice-service-auth.guard';
import { VoicePatientVerificationController } from './voice-patient-verification.controller';

/* Controller method references are inspected as metadata targets, never invoked. */
/* eslint-disable @typescript-eslint/unbound-method */

describe('VoicePatientVerificationController', () => {
  it('requires machine auth and trusted widget/session resolution for both tools', async () => {
    expect(
      Reflect.getMetadata(IS_PUBLIC_KEY, VoicePatientVerificationController),
    ).toBe(true);
    expect(
      Reflect.getMetadata('__guards__', VoicePatientVerificationController),
    ).toContain(VoiceServiceAuthGuard);
    const resolved = {
      token: 'trusted-token',
      context: { tenantId: 'tenant-a' },
    };
    const resolve = jest.fn().mockResolvedValue(resolved);
    const identify = jest
      .fn()
      .mockResolvedValue({ status: 'verification_required' });
    const verify = jest.fn().mockResolvedValue({ status: 'verified' });
    const controller = new VoicePatientVerificationController(
      { resolve } as never,
      { identify, verify } as never,
    );

    await controller.identify('widget-a', 'token-a', {
      firstName: 'Jane',
      lastName: 'Doe',
      dateOfBirth: '1985-04-17',
    });
    await controller.verify('widget-a', 'token-a', {
      phoneNumber: '+1 416 555 0123',
    });
    expect(resolve).toHaveBeenNthCalledWith(1, 'token-a', 'widget-a');
    expect(resolve).toHaveBeenNthCalledWith(2, 'token-a', 'widget-a');
    expect(identify).toHaveBeenCalledWith(resolved, expect.any(Object));
    expect(verify).toHaveBeenCalledWith(resolved, '+1 416 555 0123');
  });

  it('declares explicit five and six request per minute throttles', () => {
    expect(
      Reflect.getMetadata(
        'THROTTLER:LIMITdefault',
        VoicePatientVerificationController.prototype.identify,
      ),
    ).toBe(5);
    expect(
      Reflect.getMetadata(
        'THROTTLER:LIMITdefault',
        VoicePatientVerificationController.prototype.verify,
      ),
    ).toBe(6);
    expect(
      Reflect.getMetadata(
        'THROTTLER:TTLdefault',
        VoicePatientVerificationController.prototype.identify,
      ),
    ).toBe(60_000);
  });
});
