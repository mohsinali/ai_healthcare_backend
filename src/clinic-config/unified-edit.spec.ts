import { DayOfWeek, TenantRole } from '@prisma/client';
import { LocationsService } from './locations.service';
import { ProvidersService } from './providers.service';
import { ServicesService } from './services.service';

describe('transactional clinic configuration edits', () => {
  const context = {
    tenantId: 'tenant-id',
    tenantSlug: 'clinic',
    tenantRole: TenantRole.CLINIC_OWNER,
    membershipId: 'membership-id',
  };

  it('updates a provider and both assignment sets in one transaction', async () => {
    const tx = {
      provider: { update: jest.fn() },
      providerLocation: { deleteMany: jest.fn(), createMany: jest.fn() },
      providerService: { deleteMany: jest.fn(), createMany: jest.fn() },
    };
    const prisma = {
      provider: {
        findFirst: jest
          .fn()
          .mockResolvedValue({ providerLocations: [], providerServices: [] }),
      },
      location: { count: jest.fn().mockResolvedValue(1) },
      service: { count: jest.fn().mockResolvedValue(1) },
      $transaction: jest.fn((work: (client: typeof tx) => unknown) => work(tx)),
    };
    const service = new ProvidersService(prisma as never, {} as never);

    await service.edit(context, 'provider-id', {
      firstName: 'Ada',
      locationIds: ['location-id'],
      serviceIds: ['service-id'],
    });

    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(tx.provider.update).toHaveBeenCalledTimes(1);
    expect(tx.providerLocation.createMany).toHaveBeenCalledTimes(1);
    expect(tx.providerService.createMany).toHaveBeenCalledTimes(1);
  });

  it('updates a service and both assignment sets in one transaction', async () => {
    const tx = {
      service: { update: jest.fn() },
      locationService: { deleteMany: jest.fn(), createMany: jest.fn() },
      providerService: { deleteMany: jest.fn(), createMany: jest.fn() },
    };
    const prisma = {
      service: {
        findFirst: jest
          .fn()
          .mockResolvedValue({ providerServices: [], locationServices: [] }),
      },
      location: { count: jest.fn().mockResolvedValue(1) },
      provider: { count: jest.fn().mockResolvedValue(1) },
      $transaction: jest.fn((work: (client: typeof tx) => unknown) => work(tx)),
    };
    const service = new ServicesService(prisma as never, {} as never);

    await service.edit(context, 'service-id', {
      name: 'Consultation',
      locationIds: ['location-id'],
      providerIds: ['provider-id'],
    });

    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(tx.service.update).toHaveBeenCalledTimes(1);
    expect(tx.locationService.createMany).toHaveBeenCalledTimes(1);
    expect(tx.providerService.createMany).toHaveBeenCalledTimes(1);
  });

  it('updates a location, hours, and services in one transaction', async () => {
    const tx = {
      location: { update: jest.fn() },
      businessHour: { update: jest.fn() },
      locationService: { deleteMany: jest.fn(), createMany: jest.fn() },
    };
    const prisma = {
      location: {
        findFirst: jest.fn().mockResolvedValue({
          businessHours: [],
          providerLocations: [],
          locationServices: [],
          _count: { providerLocations: 0, locationServices: 0 },
        }),
      },
      service: { count: jest.fn().mockResolvedValue(1) },
      $transaction: jest.fn((work: (client: typeof tx) => unknown) => work(tx)),
    };
    const service = new LocationsService(prisma as never, {} as never);
    const businessHours = Object.values(DayOfWeek).map((dayOfWeek) => ({
      dayOfWeek,
      isClosed: false,
      openTime: '09:00',
      closeTime: '17:00',
    }));

    await service.edit(context, 'location-id', {
      name: 'Main Clinic',
      serviceIds: ['service-id'],
      businessHours,
    });

    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(tx.location.update).toHaveBeenCalledTimes(1);
    expect(tx.businessHour.update).toHaveBeenCalledTimes(7);
    expect(tx.locationService.createMany).toHaveBeenCalledTimes(1);
  });
});
