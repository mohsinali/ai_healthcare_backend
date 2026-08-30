import { ConfigurationStatus } from '@prisma/client';
import { VoiceDirectoryService } from './voice-directory.service';

/* eslint-disable @typescript-eslint/no-unsafe-assignment -- Jest asymmetric matchers are typed as any. */

describe('VoiceDirectoryService', () => {
  const context = { tenantId: 'tenant-a', locationId: 'location-a' } as never;
  const location = { name: 'Downtown Clinic' };

  function setup(overrides: Record<string, jest.Mock> = {}) {
    const prisma = {
      location: { findFirst: jest.fn().mockResolvedValue(location) },
      service: {
        findMany: jest.fn().mockResolvedValue([]),
        findFirst: jest.fn().mockResolvedValue(null),
      },
      provider: { findMany: jest.fn().mockResolvedValue([]) },
      appointment: { findMany: jest.fn() },
      patient: { findMany: jest.fn() },
    };
    for (const [path, mock] of Object.entries(overrides)) {
      const [model, method] = path.split('.');
      (prisma as never as Record<string, Record<string, jest.Mock>>)[model][
        method
      ] = mock;
    }
    return { prisma, service: new VoiceDirectoryService(prisma as never) };
  }

  it('lists active services at only the trusted tenant and selected location', async () => {
    const rows = [
      {
        name: 'General Consultation',
        description: 'Routine consultation',
        durationMinutes: 30,
      },
    ];
    const { service, prisma } = setup({
      'service.findMany': jest.fn().mockResolvedValue(rows),
    });
    await expect(service.searchServices(context)).resolves.toEqual({
      status: 'ok',
      message: 'Found 1 configured service at Downtown Clinic.',
      location,
      services: rows,
    });
    expect(prisma.service.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          tenantId: 'tenant-a',
          status: ConfigurationStatus.ACTIVE,
          locationServices: {
            some: { tenantId: 'tenant-a', locationId: 'location-a' },
          },
        },
        select: { name: true, description: true, durationMinutes: true },
        take: 10,
      }),
    );
  });

  it('searches service name and description case-insensitively', async () => {
    const { service, prisma } = setup();
    await service.searchServices(context, 'Do you provide PeDiAtRiC care?');
    expect(prisma.service.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          OR: [
            { name: { contains: 'pediatric', mode: 'insensitive' } },
            { description: { contains: 'pediatric', mode: 'insensitive' } },
            { name: { contains: 'care', mode: 'insensitive' } },
            { description: { contains: 'care', mode: 'insensitive' } },
          ],
        }),
      }),
    );
  });

  it('returns structured no_match and location_required outcomes', async () => {
    const { service } = setup();
    await expect(
      service.searchServices(context, 'unknown'),
    ).resolves.toMatchObject({ status: 'no_match', services: [] });
    await expect(
      service.searchServices(context, undefined, null),
    ).resolves.toEqual({
      status: 'location_required',
      message: 'Select a clinic location before searching services.',
      services: [],
    });
  });

  it('lists providers and maps no private or internal fields', async () => {
    const raw = {
      id: 'provider-uuid',
      tenantId: 'tenant-a',
      firstName: 'Sarah',
      lastName: 'Ahmed',
      displayName: 'Dr. Sarah Ahmed',
      title: 'Dr.',
      email: 'private@example.test',
      phone: '+15550000',
      createdAt: new Date(),
      providerServices: [
        { service: { name: 'General Consultation', id: 'service-uuid' } },
      ],
    };
    const { service, prisma } = setup({
      'provider.findMany': jest.fn().mockResolvedValue([raw]),
    });
    const result = await service.searchProviders(context, {});
    expect(result).toEqual({
      status: 'ok',
      message: 'Found 1 configured provider at Downtown Clinic.',
      location,
      providers: [
        {
          name: 'Dr. Sarah Ahmed',
          services: ['General Consultation'],
        },
      ],
    });
    expect(JSON.stringify(result)).not.toMatch(
      /uuid|tenantId|createdAt|private@example|15550000/,
    );
    expect(prisma.provider.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          tenantId: 'tenant-a',
          status: ConfigurationStatus.ACTIVE,
          providerLocations: {
            some: { tenantId: 'tenant-a', locationId: 'location-a' },
          },
        }),
      }),
    );
  });

  it('searches provider public name fields case-insensitively', async () => {
    const { service, prisma } = setup();
    await service.searchProviders(context, { query: 'sArAh' });
    expect(prisma.provider.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          OR: expect.arrayContaining([
            { firstName: { contains: 'sArAh', mode: 'insensitive' } },
            { displayName: { contains: 'sArAh', mode: 'insensitive' } },
          ]),
        }),
      }),
    );
  });

  it('resolves and filters an existing service only within tenant and location', async () => {
    const { service, prisma } = setup({
      'service.findFirst': jest.fn().mockResolvedValue({ id: 'service-a' }),
    });
    await service.searchProviders(context, {
      serviceName: 'General Consultation',
    });
    expect(prisma.service.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          tenantId: 'tenant-a',
          status: ConfigurationStatus.ACTIVE,
          locationServices: {
            some: { tenantId: 'tenant-a', locationId: 'location-a' },
          },
        }),
        select: { id: true },
      }),
    );
    expect(prisma.provider.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          providerServices: {
            some: { tenantId: 'tenant-a', serviceId: 'service-a' },
          },
        }),
      }),
    );
  });

  it('distinguishes unknown service from an existing service with no providers', async () => {
    const { service } = setup();
    await expect(
      service.searchProviders(context, { serviceName: 'Unknown' }),
    ).resolves.toMatchObject({
      status: 'service_not_found',
      providers: [],
    });
    const existing = setup({
      'service.findFirst': jest.fn().mockResolvedValue({ id: 'service-a' }),
    });
    await expect(
      existing.service.searchProviders(context, {
        serviceName: 'General Consultation',
      }),
    ).resolves.toMatchObject({
      status: 'no_match',
      providers: [],
      message: expect.stringContaining('no providers are associated'),
    });
  });

  it('returns location_required without querying directory, appointment, or patient data', async () => {
    const { service, prisma } = setup();
    await expect(service.searchProviders(context, {}, null)).resolves.toEqual({
      status: 'location_required',
      message: 'Select a clinic location before searching providers.',
      providers: [],
    });
    expect(prisma.service.findFirst).not.toHaveBeenCalled();
    expect(prisma.provider.findMany).not.toHaveBeenCalled();
    expect(prisma.appointment.findMany).not.toHaveBeenCalled();
    expect(prisma.patient.findMany).not.toHaveBeenCalled();
  });

  it('tenant-scopes active-location validation and never touches appointments or patients', async () => {
    const { service, prisma } = setup();
    await service.searchServices(context);
    await service.searchProviders(context, {});
    expect(prisma.location.findFirst).toHaveBeenCalledWith({
      where: {
        id: 'location-a',
        tenantId: 'tenant-a',
        status: ConfigurationStatus.ACTIVE,
      },
      select: { name: true },
    });
    expect(prisma.appointment.findMany).not.toHaveBeenCalled();
    expect(prisma.patient.findMany).not.toHaveBeenCalled();
  });
});
