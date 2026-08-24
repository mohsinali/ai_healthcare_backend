import { TenantRole } from '@prisma/client';
import { LocationsService } from './locations.service';

describe('LocationsService', () => {
  const context = {
    tenantId: 'tenant-id',
    tenantSlug: 'clinic',
    tenantRole: TenantRole.CLINIC_OWNER,
    membershipId: 'membership-id',
  };

  it('creates the location and all seven business-hour rows in one transaction', async () => {
    const created = { id: 'location-id' };
    const complete = { id: created.id, name: 'Clifton Branch' };
    let capturedHours: Array<{
      dayOfWeek: string;
      isClosed: boolean;
      openTime: string | null;
      closeTime: string | null;
    }> = [];
    const tx = {
      location: {
        create: jest.fn().mockResolvedValue(created),
        findUniqueOrThrow: jest.fn().mockResolvedValue(complete),
      },
      businessHour: {
        createMany: jest.fn(
          (args: {
            data: typeof capturedHours;
          }): Promise<{ count: number }> => {
            capturedHours = args.data;
            return Promise.resolve({ count: 7 });
          },
        ),
      },
    };
    const prisma = {
      $transaction: jest.fn((work: (client: typeof tx) => unknown) => work(tx)),
    };
    const service = new LocationsService(prisma as never);

    const result = await service.create(context, {
      name: 'Clifton Branch',
      phone: '+923343683084',
      timezone: 'Asia/Karachi',
      addressLine1: 'MC 1081 Green Town',
      city: 'Karachi',
      stateProvince: 'Sindh',
      postalCode: '75230',
      countryCode: 'PK',
    });

    expect(result).toBe(complete);
    expect(tx.location.create).toHaveBeenCalledTimes(1);
    expect(capturedHours).toHaveLength(7);
    expect(capturedHours).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          dayOfWeek: 'MONDAY',
          isClosed: false,
          openTime: '09:00',
          closeTime: '17:00',
        }),
        expect.objectContaining({
          dayOfWeek: 'SATURDAY',
          isClosed: true,
          openTime: null,
          closeTime: null,
        }),
      ]),
    );
  });

  it('returns assigned providers and services in a tenant-scoped detail response', async () => {
    const findFirst = jest.fn().mockResolvedValue({
      id: 'location-id',
      tenantId: 'tenant-id',
      name: 'Main Clinic',
      businessHours: [],
      providerLocations: [
        { provider: { id: 'provider-id', firstName: 'Sarah' } },
      ],
      locationServices: [
        { service: { id: 'service-id', name: 'Consultation' } },
      ],
      _count: { providerLocations: 1, locationServices: 1 },
    });
    const service = new LocationsService({ location: { findFirst } } as never);

    await expect(service.get(context, 'location-id')).resolves.toMatchObject({
      providerCount: 1,
      serviceCount: 1,
      providers: [{ id: 'provider-id' }],
      services: [{ id: 'service-id' }],
    });
    expect(findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'location-id', tenantId: 'tenant-id' },
      }),
    );
  });
});
