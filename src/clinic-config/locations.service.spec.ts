import { TenantRole } from '@prisma/client';
import { LocationsService } from './locations.service';

describe('LocationsService', () => {
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

    const result = await service.create(
      {
        tenantId: 'tenant-id',
        tenantSlug: 'clinic',
        tenantRole: TenantRole.CLINIC_OWNER,
        membershipId: 'membership-id',
      },
      {
        name: 'Clifton Branch',
        phone: '+923343683084',
        timezone: 'Asia/Karachi',
        addressLine1: 'MC 1081 Green Town',
        city: 'Karachi',
        stateProvince: 'Sindh',
        postalCode: '75230',
        countryCode: 'PK',
      },
    );

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
});
