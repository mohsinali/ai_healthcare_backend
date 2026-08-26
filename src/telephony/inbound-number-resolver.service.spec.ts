import {
  ConfigurationStatus,
  TelephonyNumberStatus,
  TelephonyProvider,
  TenantStatus,
} from '@prisma/client';
import {
  InboundNumberResolutionError,
  InboundNumberResolutionFailure,
} from './inbound-number-resolution.error';
import { InboundNumberResolverService } from './inbound-number-resolver.service';

/* Jest mock call payloads are intentionally dynamic at the Prisma boundary. */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */

describe('InboundNumberResolverService', () => {
  const mapping = {
    id: 'number-id',
    phoneNumber: '+13055551001',
    provider: TelephonyProvider.TWILIO,
    providerPhoneNumberId: 'PN123',
    status: TelephonyNumberStatus.ACTIVE,
    tenant: {
      id: 'tenant-id',
      name: 'Clinic',
      slug: 'clinic',
      status: TenantStatus.ACTIVE,
    },
    location: {
      id: 'location-id',
      name: 'Downtown',
      status: ConfigurationStatus.ACTIVE,
      timezone: 'America/New_York',
      escalationPhoneNumber: '+13055559999',
    },
  };

  const resolver = (value: unknown) =>
    new InboundNumberResolverService({
      telephonyNumber: { findUnique: jest.fn().mockResolvedValue(value) },
    } as never);

  it('normalizes the called number and resolves trusted tenant/location context', async () => {
    const findUnique = jest.fn().mockResolvedValue(mapping);
    const service = new InboundNumberResolverService({
      telephonyNumber: { findUnique },
    } as never);
    await expect(service.resolve('+1 305 555 1001')).resolves.toMatchObject({
      telephonyNumberId: 'number-id',
      tenantId: 'tenant-id',
      locationId: 'location-id',
      timezone: 'America/New_York',
      escalationPhoneNumber: '+13055559999',
    });
    expect(findUnique.mock.calls[0][0].where).toEqual({
      phoneNumber: '+13055551001',
    });
  });

  it('resolves a tenant-wide number without requiring a location', async () => {
    await expect(
      resolver({ ...mapping, location: null }).resolve('+13055551001'),
    ).resolves.toMatchObject({
      tenantId: 'tenant-id',
      locationId: null,
      timezone: null,
      escalationPhoneNumber: null,
    });
  });

  it.each([
    ['invalid', null, InboundNumberResolutionFailure.INVALID_PHONE_NUMBER],
    ['+13055551001', null, InboundNumberResolutionFailure.NUMBER_NOT_FOUND],
    [
      '+13055551001',
      { ...mapping, status: TelephonyNumberStatus.INACTIVE },
      InboundNumberResolutionFailure.NUMBER_INACTIVE,
    ],
    [
      '+13055551001',
      {
        ...mapping,
        tenant: { ...mapping.tenant, status: TenantStatus.SUSPENDED },
      },
      InboundNumberResolutionFailure.TENANT_INACTIVE,
    ],
    [
      '+13055551001',
      {
        ...mapping,
        location: { ...mapping.location, status: ConfigurationStatus.INACTIVE },
      },
      InboundNumberResolutionFailure.LOCATION_INACTIVE,
    ],
  ])('returns typed failure %s / %s', async (input, value, reason) => {
    await expect(resolver(value).resolve(input)).rejects.toMatchObject<
      Partial<InboundNumberResolutionError>
    >({ reason, message: 'Inbound number is unavailable.' });
  });
});
