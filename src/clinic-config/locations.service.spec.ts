import { DayOfWeek, TenantRole } from '@prisma/client';
import { FieldValidationException } from '../common/validation/field-validation.exception';
import { LocationsService } from './locations.service';
import { scheduleConflictCodes } from './scheduling-invariants';

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
      $executeRaw: jest.fn(),
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
    const service = new LocationsService(
      prisma as never,
      {
        next: jest.fn().mockResolvedValue({ formatted: 'LOC-01', value: 1 }),
      } as never,
    );

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
    expect(tx.$executeRaw).toHaveBeenCalledTimes(1);
    expect(tx.location.create).toHaveBeenCalledWith(
      expect.objectContaining({
        // Jest asymmetric matchers are intentionally typed as any.
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
        data: expect.objectContaining({ locationNumber: 'LOC-01' }),
      }),
    );
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
    const service = new LocationsService(
      { location: { findFirst } } as never,
      {} as never,
    );

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

  it.each([
    ['phone', { phone: 'asdfasdf' }],
    ['escalationPhoneNumber', { escalationPhoneNumber: '123xyz' }],
  ])(
    'returns invalid %s as a structured field error',
    async (field, invalid) => {
      const service = new LocationsService({} as never, {} as never);
      const promise = service.create(context, {
        name: 'Clifton Branch',
        phone: '+923343683084',
        timezone: 'Asia/Karachi',
        addressLine1: 'MC 1081 Green Town',
        city: 'Karachi',
        stateProvince: 'Sindh',
        postalCode: '75230',
        countryCode: 'PK',
        ...invalid,
      });

      await expect(promise).rejects.toBeInstanceOf(FieldValidationException);
      await expect(promise).rejects.toMatchObject({
        response: {
          message: 'Validation failed.',
          errors: [
            {
              field,
              message: 'Enter a valid international phone number.',
            },
          ],
        },
      });
    },
  );

  describe('business-hours schedule protection', () => {
    const hours = Object.values(DayOfWeek).map((dayOfWeek) => ({
      dayOfWeek,
      isClosed:
        dayOfWeek === DayOfWeek.SATURDAY || dayOfWeek === DayOfWeek.SUNDAY,
      openTime:
        dayOfWeek === DayOfWeek.SATURDAY || dayOfWeek === DayOfWeek.SUNDAY
          ? null
          : '09:00',
      closeTime:
        dayOfWeek === DayOfWeek.SATURDAY || dayOfWeek === DayOfWeek.SUNDAY
          ? null
          : '17:00',
    }));

    function setup(periods: unknown[] = []) {
      const tx = {
        $executeRaw: jest.fn(),
        location: {
          findFirst: jest.fn().mockResolvedValue({
            status: 'ACTIVE',
            businessHours: hours,
          }),
          update: jest.fn(),
        },
        providerWorkingPeriod: {
          findMany: jest.fn().mockResolvedValue(periods),
        },
        businessHour: { update: jest.fn() },
        locationService: { deleteMany: jest.fn(), createMany: jest.fn() },
      };
      const prisma = {
        location: {
          findFirst: jest.fn().mockResolvedValue({
            businessHours: hours,
            providerLocations: [],
            locationServices: [],
            _count: { providerLocations: 0, locationServices: 0 },
          }),
        },
        businessHour: { findMany: jest.fn().mockResolvedValue(hours) },
        $transaction: jest.fn((work: (client: typeof tx) => unknown) =>
          work(tx),
        ),
      };
      return {
        tx,
        prisma,
        service: new LocationsService(prisma as never, {} as never),
      };
    }

    it('locks before validation reads and applies a compatible update', async () => {
      const { tx, service } = setup([
        {
          providerId: 'provider-a',
          dayOfWeek: DayOfWeek.MONDAY,
          startTime: '10:00',
          endTime: '16:00',
          isActive: true,
          providerLocation: {
            provider: {
              displayName: 'Dr A',
              firstName: 'A',
              lastName: 'Doctor',
            },
          },
        },
      ]);

      await service.updateBusinessHours(context, 'location-id', { hours });

      expect(tx.$executeRaw).toHaveBeenCalledTimes(1);
      expect(tx.$executeRaw.mock.invocationCallOrder[0]).toBeLessThan(
        tx.location.findFirst.mock.invocationCallOrder[0],
      );
      expect(tx.providerWorkingPeriod.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            tenantId: 'tenant-id',
            locationId: 'location-id',
            isActive: true,
          },
        }),
      );
      expect(tx.businessHour.update).toHaveBeenCalledTimes(7);
    });

    it('rejects incompatible hours before mutation with structured details', async () => {
      const { tx, service } = setup([
        {
          providerId: 'provider-a',
          dayOfWeek: DayOfWeek.MONDAY,
          startTime: '09:00',
          endTime: '12:00',
          isActive: true,
          providerLocation: {
            provider: {
              displayName: null,
              firstName: 'Ada',
              lastName: 'Lovelace',
            },
          },
        },
      ]);
      const reduced = hours.map((hour) =>
        hour.dayOfWeek === DayOfWeek.MONDAY
          ? { ...hour, openTime: '10:00' }
          : hour,
      );

      const promise = service.updateBusinessHours(context, 'location-id', {
        hours: reduced,
      });
      await expect(promise).rejects.toMatchObject({
        response: {
          code: scheduleConflictCodes.locationHours,
          conflicts: [
            expect.objectContaining({
              providerId: 'provider-a',
              providerName: 'Ada Lovelace',
              locationId: 'location-id',
            }),
          ],
        },
      });
      expect(tx.businessHour.update).not.toHaveBeenCalled();
    });

    it('protects the unified edit path with the same lock and validation', async () => {
      const { tx, prisma, service } = setup();
      (prisma as never as { service: { count: jest.Mock } }).service = {
        count: jest.fn().mockResolvedValue(0),
      };

      await service.edit(context, 'location-id', {
        businessHours: hours,
        serviceIds: [],
      });

      expect(tx.$executeRaw).toHaveBeenCalledTimes(1);
      expect(tx.providerWorkingPeriod.findMany).toHaveBeenCalledTimes(1);
      expect(tx.location.update).toHaveBeenCalledTimes(1);
    });
  });
});
