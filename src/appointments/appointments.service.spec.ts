import { BadRequestException } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import { SequenceService } from '../sequences/sequence.service';
import { TrustedTenantContext } from '../tenants/types/tenant-context';
import { AppointmentsService } from './appointments.service';

const context = {
  tenantId: '10000000-0000-4000-8000-000000000001',
  tenantSlug: 'clinic',
  tenantRole: 'CLINIC_OWNER',
  membershipId: '20000000-0000-4000-8000-000000000001',
} as TrustedTenantContext;
const ids = {
  locationId: '30000000-0000-4000-8000-000000000001',
  providerId: '40000000-0000-4000-8000-000000000001',
  serviceId: '50000000-0000-4000-8000-000000000001',
};

function setup(options?: {
  closed?: boolean;
  appointments?: { startAt: Date; endAt: Date }[];
  providerLocation?: boolean;
  periods?: Array<{
    dayOfWeek: 'THURSDAY';
    startTime: string;
    endTime: string;
    isActive: boolean;
  }>;
}) {
  const prisma = {
    location: {
      findFirst: jest.fn().mockResolvedValue({
        id: ids.locationId,
        status: 'ACTIVE',
        timezone: 'America/New_York',
        businessHours: [
          {
            dayOfWeek: 'THURSDAY',
            isClosed: options?.closed ?? false,
            openTime: '09:00',
            closeTime: '10:00',
          },
        ],
        locationServices: [{ id: 'assignment' }],
      }),
    },
    provider: {
      findFirst: jest.fn().mockResolvedValue({
        id: ids.providerId,
        status: 'ACTIVE',
        providerLocations:
          options?.providerLocation === false ? [] : [{ id: 'assignment' }],
        providerServices: [{ id: 'assignment' }],
      }),
    },
    service: {
      findFirst: jest.fn().mockResolvedValue({
        id: ids.serviceId,
        status: 'ACTIVE',
        durationMinutes: 30,
      }),
    },
    appointment: {
      findMany: jest.fn().mockResolvedValue(options?.appointments ?? []),
    },
    providerWorkingPeriod: {
      findMany: jest.fn().mockResolvedValue(
        options?.periods ?? [
          {
            dayOfWeek: 'THURSDAY',
            startTime: '09:00',
            endTime: '10:00',
            isActive: true,
          },
        ],
      ),
    },
  };
  return {
    prisma,
    service: new AppointmentsService(
      prisma as unknown as PrismaService,
      {} as SequenceService,
    ),
  };
}

describe('AppointmentsService availability', () => {
  it('uses Location timezone, Service duration, and the 15-minute interval', async () => {
    const { service } = setup();
    const result = await service.availability(context, {
      ...ids,
      date: '2026-09-10',
    });
    expect(result.timezone).toBe('America/New_York');
    expect(result.durationMinutes).toBe(30);
    expect(result.slotIntervalMinutes).toBe(15);
    expect(result.slots.map((x) => x.start)).toEqual([
      '2026-09-10T09:00:00.000-04:00',
      '2026-09-10T09:15:00.000-04:00',
      '2026-09-10T09:30:00.000-04:00',
    ]);
  });

  it('returns no slots on a closed day and never invents times', async () => {
    const { service } = setup({ closed: true });
    await expect(
      service.availability(context, { ...ids, date: '2026-09-10' }),
    ).resolves.toMatchObject({ slots: [] });
  });

  it('does not fall back to Location hours when the provider schedule is empty', async () => {
    const { service, prisma } = setup({ periods: [] });
    await expect(
      service.availability(context, { ...ids, date: '2026-09-10' }),
    ).resolves.toMatchObject({ slots: [] });
    expect(prisma.appointment.findMany).not.toHaveBeenCalled();
  });

  it('removes every overlapping slot and queries only blocking appointments', async () => {
    const { service, prisma } = setup({
      appointments: [
        {
          startAt: new Date('2026-09-10T13:15:00Z'),
          endAt: new Date('2026-09-10T13:45:00Z'),
        },
      ],
    });
    const result = await service.availability(context, {
      ...ids,
      date: '2026-09-10',
    });
    expect(result.slots.map((x) => x.start)).toEqual([]);
    expect(prisma.appointment.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        // Jest asymmetric matchers are intentionally typed as any.
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
        where: expect.objectContaining({
          status: { in: ['BOOKED', 'CONFIRMED'] },
        }),
      }),
    );
  });

  it('rejects a Provider not assigned to the Location', async () => {
    const { service } = setup({ providerLocation: false });
    await expect(
      service.availability(context, { ...ids, date: '2026-09-10' }),
    ).rejects.toThrow(BadRequestException);
  });
});
