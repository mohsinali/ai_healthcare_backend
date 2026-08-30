import { VoiceAvailabilityService } from './voice-availability.service';

/* eslint-disable @typescript-eslint/no-unsafe-assignment -- Jest asymmetric matchers are typed as any. */

describe('VoiceAvailabilityService', () => {
  const context = { tenantId: 'tenant-a', locationId: 'location-a' } as never;
  const location = { name: 'Downtown Clinic', timezone: 'America/New_York' };
  const configuredService = {
    id: 'service-a',
    name: 'General Consultation',
    durationMinutes: 30,
  };

  function setup() {
    const prisma = {
      location: { findFirst: jest.fn().mockResolvedValue(location) },
      service: { findFirst: jest.fn().mockResolvedValue(configuredService) },
      provider: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'provider-a',
          providerServices: [{ id: 'join-a' }],
        }),
        findMany: jest
          .fn()
          .mockResolvedValue([{ id: 'provider-a' }, { id: 'provider-b' }]),
      },
    };
    const availability = {
      search: jest.fn().mockResolvedValue({
        location,
        service: { name: configuredService.name, durationMinutes: 30 },
        slots: [
          {
            providerId: 'provider-a',
            providerName: 'Dr. Sarah Ahmed',
            localDate: '2026-09-01',
            localTime: '09:00',
            startsAt: '2026-09-01T09:00:00.000-04:00',
            endsAt: '2026-09-01T09:30:00.000-04:00',
          },
        ],
      }),
    };
    return {
      prisma,
      availability,
      service: new VoiceAvailabilityService(
        prisma as never,
        availability as never,
      ),
    };
  }

  it('resolves a service and all eligible providers in trusted tenant/location scope', async () => {
    const { service, prisma, availability } = setup();
    const result = await service.search(context, {
      serviceName: ' General Consultation ',
    });
    expect(result).toMatchObject({
      status: 'ok',
      requestedProvider: null,
      slots: [{ option: 1, providerName: 'Dr. Sarah Ahmed' }],
    });
    expect(prisma.service.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          tenantId: 'tenant-a',
          status: 'ACTIVE',
          locationServices: {
            some: { tenantId: 'tenant-a', locationId: 'location-a' },
          },
        }),
      }),
    );
    expect(prisma.provider.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          tenantId: 'tenant-a',
          providerLocations: {
            some: { tenantId: 'tenant-a', locationId: 'location-a' },
          },
          providerServices: {
            some: { tenantId: 'tenant-a', serviceId: 'service-a' },
          },
        }),
      }),
    );
    expect(availability.search).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: 'tenant-a',
        locationId: 'location-a',
        providerIds: ['provider-a', 'provider-b'],
      }),
    );
    expect(JSON.stringify(result)).not.toMatch(
      /provider-a|service-a|tenant-a|location-a/,
    );
  });

  it('resolves and searches only a specifically requested qualified provider', async () => {
    const { service, availability } = setup();
    await service.search(context, {
      serviceName: 'Consultation',
      providerName: 'Dr. Sarah Ahmed',
    });
    expect(availability.search).toHaveBeenCalledWith(
      expect.objectContaining({ providerIds: ['provider-a'] }),
    );
  });

  it('returns expected conversational outcomes without calling the domain search', async () => {
    const missingLocation = setup();
    await expect(
      missingLocation.service.search(context, { serviceName: 'Care' }, null),
    ).resolves.toMatchObject({ status: 'location_required', slots: [] });
    expect(missingLocation.availability.search).not.toHaveBeenCalled();

    const missingService = setup();
    missingService.prisma.service.findFirst.mockResolvedValue(null);
    await expect(
      missingService.service.search(context, { serviceName: 'Unknown' }),
    ).resolves.toMatchObject({ status: 'service_not_found', slots: [] });

    const missingProvider = setup();
    missingProvider.prisma.provider.findFirst.mockResolvedValue(null);
    await expect(
      missingProvider.service.search(context, {
        serviceName: 'Care',
        providerName: 'Unknown',
      }),
    ).resolves.toMatchObject({ status: 'provider_not_found', slots: [] });

    const unqualified = setup();
    unqualified.prisma.provider.findFirst.mockResolvedValue({
      id: 'provider-a',
      providerServices: [],
    });
    await expect(
      unqualified.service.search(context, {
        serviceName: 'Care',
        providerName: 'Dr. Other',
      }),
    ).resolves.toMatchObject({ status: 'provider_not_qualified', slots: [] });
  });

  it('returns no_availability and performs no writes or patient access', async () => {
    const { service, availability, prisma } = setup();
    availability.search.mockResolvedValue({
      location,
      service: configuredService,
      slots: [],
    });
    await expect(
      service.search(context, { serviceName: 'Care' }),
    ).resolves.toMatchObject({ status: 'no_availability', slots: [] });
    expect(Object.keys(prisma)).toEqual(['location', 'service', 'provider']);
  });
});
