import { BadRequestException, NotFoundException } from '@nestjs/common';
import { TelephonyProvider } from '@prisma/client';
import {
  InboundNumberResolutionError,
  InboundNumberResolutionFailure,
} from '../telephony/inbound-number-resolution.error';
import { InboundNumberResolverService } from '../telephony/inbound-number-resolver.service';
import { VoiceBootstrapService } from './voice-bootstrap.service';

describe('VoiceBootstrapService', () => {
  const resolved = {
    telephonyNumberId: 'number-id',
    phoneNumber: '+13055551001',
    provider: TelephonyProvider.TWILIO,
    providerPhoneNumberId: 'provider-id',
    tenantId: 'tenant-a',
    tenantName: 'Tenant A',
    tenantSlug: 'tenant-a',
    locationId: 'location-a',
    locationName: 'Downtown',
    timezone: 'America/New_York',
    escalationPhoneNumber: '+13055559999',
  };

  const create = (result: unknown = resolved) => {
    const resolve =
      result instanceof Error
        ? jest.fn().mockRejectedValue(result)
        : jest.fn().mockResolvedValue(result);
    return {
      service: new VoiceBootstrapService({
        resolve,
      } as unknown as InboundNumberResolverService),
      resolve,
    };
  };

  it('uses the resolver and exposes only the minimal external context', async () => {
    const { service, resolve } = create();
    await expect(service.bootstrap('+1 305 555 1001')).resolves.toEqual({
      context: {
        tenantId: 'tenant-a',
        tenantName: 'Tenant A',
        locationId: 'location-a',
        locationName: 'Downtown',
        timezone: 'America/New_York',
      },
      calledNumber: '+13055551001',
    });
    expect(resolve).toHaveBeenCalledWith('+1 305 555 1001');
    const response = await service.bootstrap('+13055551001');
    expect(response).not.toHaveProperty('telephonyNumberId');
    expect(JSON.stringify(response)).not.toMatch(
      /patient|appointment|faq|providerPhoneNumberId|escalation/i,
    );
  });

  it('preserves tenant-wide null location semantics', async () => {
    const { service } = create({
      ...resolved,
      locationId: null,
      locationName: null,
      timezone: null,
      escalationPhoneNumber: null,
    });
    await expect(service.bootstrap('+13055551001')).resolves.toMatchObject({
      context: { locationId: null, locationName: null, timezone: null },
    });
  });

  it('maps malformed numbers to 400', async () => {
    const { service } = create(
      new InboundNumberResolutionError(
        InboundNumberResolutionFailure.INVALID_PHONE_NUMBER,
      ),
    );
    await expect(service.bootstrap('invalid')).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it.each([
    InboundNumberResolutionFailure.NUMBER_NOT_FOUND,
    InboundNumberResolutionFailure.NUMBER_INACTIVE,
    InboundNumberResolutionFailure.TENANT_INACTIVE,
    InboundNumberResolutionFailure.LOCATION_INACTIVE,
  ])(
    'maps unavailable destination reason %s to the same safe 404',
    async (reason) => {
      const { service } = create(new InboundNumberResolutionError(reason));
      await expect(service.bootstrap('+13055551001')).rejects.toMatchObject({
        response: {
          message: 'Inbound voice destination is unavailable.',
          statusCode: 404,
        },
      });
      await expect(service.bootstrap('+13055551001')).rejects.toBeInstanceOf(
        NotFoundException,
      );
    },
  );
});
