import { BadRequestException } from '@nestjs/common';
import { DayOfWeek } from '@prisma/client';
import { AvailabilitySearchService } from './availability-search.service';

/* eslint-disable @typescript-eslint/no-unsafe-assignment -- Jest asymmetric matchers are typed as any. */

describe('AvailabilitySearchService', () => {
  const hours: Array<{
    dayOfWeek: DayOfWeek;
    isClosed: boolean;
    openTime: string;
    closeTime: string;
  }> = [
    {
      dayOfWeek: DayOfWeek.TUESDAY,
      isClosed: false,
      openTime: '09:00',
      closeTime: '18:00',
    },
  ];

  function setup(
    options: {
      hours?: typeof hours;
      duration?: number;
      appointments?: Array<{ providerId: string; startAt: Date; endAt: Date }>;
      periods?: Array<{
        providerId: string;
        dayOfWeek: DayOfWeek;
        startTime: string;
        endTime: string;
        isActive: boolean;
      }>;
      timezone?: string;
    } = {},
  ) {
    const prisma = {
      location: {
        findFirst: jest.fn().mockResolvedValue({
          name: 'Downtown Clinic',
          timezone: options.timezone ?? 'America/New_York',
          businessHours: options.hours ?? hours,
        }),
      },
      service: {
        findFirst: jest.fn().mockResolvedValue({
          name: 'General Consultation',
          durationMinutes: options.duration ?? 30,
        }),
      },
      provider: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'provider-b',
            firstName: 'Ben',
            lastName: 'Zulu',
            displayName: 'Dr. Zulu',
            title: 'Dr.',
          },
          {
            id: 'provider-a',
            firstName: 'Amy',
            lastName: 'Alpha',
            displayName: 'Dr. Alpha',
            title: 'Dr.',
          },
        ]),
      },
      appointment: {
        findMany: jest.fn().mockResolvedValue(options.appointments ?? []),
      },
      providerWorkingPeriod: {
        findMany: jest.fn().mockResolvedValue(
          options.periods ??
            ['provider-a', 'provider-b'].map((providerId) => ({
              providerId,
              dayOfWeek: DayOfWeek.TUESDAY,
              startTime: '09:00',
              endTime: '18:00',
              isActive: true,
            })),
        ),
      },
    };
    return { prisma, service: new AvailabilitySearchService(prisma as never) };
  }

  const input = {
    tenantId: 'tenant-a',
    locationId: 'location-a',
    serviceId: 'service-a',
    providerIds: ['provider-a', 'provider-b'],
    startDate: '2026-09-01',
    endDate: '2026-09-01',
    now: new Date('2026-08-30T12:00:00Z'),
  };

  it('generates earliest deterministic provider slots within hours using duration and a five-result limit', async () => {
    const { service } = setup();
    const result = await service.search(input);
    expect(result.slots).toHaveLength(5);
    expect(
      result.slots.map((slot) => [slot.localTime, slot.providerName]),
    ).toEqual([
      ['09:00', 'Dr. Alpha'],
      ['09:00', 'Dr. Zulu'],
      ['09:15', 'Dr. Alpha'],
      ['09:15', 'Dr. Zulu'],
      ['09:30', 'Dr. Alpha'],
    ]);
    expect(result.slots[0]).toMatchObject({
      startsAt: '2026-09-01T09:00:00.000-04:00',
      endsAt: '2026-09-01T09:30:00.000-04:00',
    });
  });

  it('prevents services extending past close', async () => {
    const { service } = setup({
      hours: [{ ...hours[0], openTime: '17:30', closeTime: '18:00' }],
      duration: 45,
    });
    await expect(service.search(input)).resolves.toMatchObject({ slots: [] });
  });

  it('uses strict overlap while allowing back-to-back appointments', async () => {
    const { service } = setup({
      appointments: [
        {
          providerId: 'provider-a',
          startAt: new Date('2026-09-01T13:00:00Z'),
          endAt: new Date('2026-09-01T13:30:00Z'),
        },
      ],
    });
    const result = await service.search({
      ...input,
      providerIds: ['provider-a'],
    });
    expect(
      result.slots.find(
        (slot) =>
          slot.localTime === '09:00' && slot.providerName === 'Dr. Alpha',
      ),
    ).toBeUndefined();
    expect(
      result.slots.find(
        (slot) =>
          slot.localTime === '09:30' && slot.providerName === 'Dr. Alpha',
      ),
    ).toBeDefined();
  });

  it('blocks a provider appointment without restricting conflicts to location', async () => {
    const { service, prisma } = setup({
      appointments: [
        {
          providerId: 'provider-a',
          startAt: new Date('2026-09-01T13:00:00Z'),
          endAt: new Date('2026-09-01T13:30:00Z'),
        },
      ],
    });
    const result = await service.search({
      ...input,
      providerIds: ['provider-a'],
    });
    expect(
      result.slots.some(
        (slot) =>
          slot.localTime === '09:00' && slot.providerId === 'provider-a',
      ),
    ).toBe(false);
    expect(prisma.appointment.findMany).toHaveBeenCalledWith({
      where: {
        tenantId: 'tenant-a',
        providerId: { in: ['provider-b', 'provider-a'] },
        status: { in: ['BOOKED', 'CONFIRMED'] },
        startAt: { lt: new Date('2026-09-02T04:00:00.000Z') },
        endAt: { gt: new Date('2026-09-01T04:00:00.000Z') },
      },
      select: { providerId: true, startAt: true, endAt: true },
    });
  });

  it.each([
    ['morning', '09:00'],
    ['afternoon', '12:00'],
    ['evening', '17:00'],
  ] as const)(
    'applies the %s clinic-local filter',
    async (timeOfDay, expected) => {
      const { service } = setup();
      const result = await service.search({ ...input, timeOfDay });
      expect(result.slots[0].localTime).toBe(expected);
    },
  );

  it('defaults to a bounded seven-day local window and queries only blocking statuses in trusted scope', async () => {
    const { service, prisma } = setup();
    await service.search({
      ...input,
      startDate: undefined,
      endDate: undefined,
      now: new Date('2026-09-01T14:00:00Z'),
    });
    expect(prisma.appointment.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          tenantId: 'tenant-a',
          status: { in: ['BOOKED', 'CONFIRMED'] },
          startAt: { lt: new Date('2026-09-08T04:00:00.000Z') },
        }),
      }),
    );
    expect(prisma.location.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'location-a', tenantId: 'tenant-a', status: 'ACTIVE' },
      }),
    );
  });

  it.each([
    ['2026-09-02', '2026-09-01'],
    ['2026-09-01', '2026-09-15'],
    ['2026-02-30', '2026-03-01'],
  ])('rejects invalid range %s to %s', async (startDate, endDate) => {
    const { service } = setup();
    await expect(
      service.search({ ...input, startDate, endDate }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('converts a DST-transition search range with IANA timezone rules', async () => {
    const sunday = [
      {
        ...hours[0],
        dayOfWeek: DayOfWeek.SUNDAY,
        openTime: '09:00',
        closeTime: '10:00',
      },
    ];
    const { service, prisma } = setup({ hours: sunday });
    await service.search({
      ...input,
      startDate: '2026-11-01',
      endDate: '2026-11-01',
    });
    expect(prisma.appointment.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          startAt: { lt: new Date('2026-11-02T05:00:00.000Z') },
          endAt: { gt: new Date('2026-11-01T04:00:00.000Z') },
        }),
      }),
    );
  });

  it('keeps recurring 09:00 at local 09:00 across a DST offset change', async () => {
    const sundayPeriod = {
      providerId: 'provider-a',
      dayOfWeek: DayOfWeek.SUNDAY,
      startTime: '09:00',
      endTime: '10:00',
      isActive: true,
    };
    const sundayHours = [
      {
        ...hours[0],
        dayOfWeek: DayOfWeek.SUNDAY,
        openTime: '09:00',
        closeTime: '10:00',
      },
    ];
    const { service } = setup({
      hours: sundayHours,
      periods: [sundayPeriod],
    });
    const before = await service.search({
      ...input,
      providerIds: ['provider-a'],
      startDate: '2026-10-25',
      endDate: '2026-10-25',
    });
    const after = await service.search({
      ...input,
      providerIds: ['provider-a'],
      startDate: '2026-11-08',
      endDate: '2026-11-08',
    });
    expect(before.slots[0]).toMatchObject({
      localTime: '09:00',
      startsAt: '2026-10-25T09:00:00.000-04:00',
    });
    expect(after.slots[0]).toMatchObject({
      localTime: '09:00',
      startsAt: '2026-11-08T09:00:00.000-05:00',
    });
  });

  it('converts each location schedule with that location timezone', async () => {
    const utc = setup({ timezone: 'UTC' });
    const newYork = setup({ timezone: 'America/New_York' });
    const utcResult = await utc.service.search({
      ...input,
      providerIds: ['provider-a'],
    });
    const newYorkResult = await newYork.service.search({
      ...input,
      providerIds: ['provider-a'],
    });
    expect(utcResult.slots[0].startsAt).toBe('2026-09-01T09:00:00.000Z');
    expect(newYorkResult.slots[0].startsAt).toBe(
      '2026-09-01T09:00:00.000-04:00',
    );
  });

  it('returns no slots without reading appointments when there are no eligible providers', async () => {
    const { service, prisma } = setup();
    prisma.provider.findMany.mockResolvedValue([]);
    await expect(service.search(input)).resolves.toMatchObject({ slots: [] });
    expect(prisma.appointment.findMany).not.toHaveBeenCalled();
  });

  it('returns no slots when location hours exist but provider schedules do not', async () => {
    const { service } = setup({ periods: [] });
    await expect(service.search(input)).resolves.toMatchObject({ slots: [] });
  });

  it('loads active periods once in tenant and location scope', async () => {
    const { service, prisma } = setup();
    await service.search(input);
    expect(prisma.providerWorkingPeriod.findMany).toHaveBeenCalledTimes(1);
    expect(prisma.providerWorkingPeriod.findMany).toHaveBeenCalledWith({
      where: {
        tenantId: 'tenant-a',
        locationId: 'location-a',
        providerId: { in: ['provider-b', 'provider-a'] },
        dayOfWeek: { in: [DayOfWeek.TUESDAY] },
        isActive: true,
      },
      select: expect.any(Object),
    });
  });

  it('merges adjacent periods so a service may cross their boundary', async () => {
    const { service } = setup({
      duration: 60,
      periods: [
        {
          providerId: 'provider-a',
          dayOfWeek: DayOfWeek.TUESDAY,
          startTime: '09:00',
          endTime: '10:00',
          isActive: true,
        },
        {
          providerId: 'provider-a',
          dayOfWeek: DayOfWeek.TUESDAY,
          startTime: '10:00',
          endTime: '11:00',
          isActive: true,
        },
      ],
    });
    const result = await service.search({
      ...input,
      providerIds: ['provider-a'],
    });
    expect(result.slots.map((slot) => slot.localTime)).toContain('09:30');
  });

  it('does not let an appointment bridge a positive split-period gap', async () => {
    const { service } = setup({
      duration: 60,
      periods: [
        {
          providerId: 'provider-a',
          dayOfWeek: DayOfWeek.TUESDAY,
          startTime: '09:00',
          endTime: '10:00',
          isActive: true,
        },
        {
          providerId: 'provider-a',
          dayOfWeek: DayOfWeek.TUESDAY,
          startTime: '10:30',
          endTime: '11:30',
          isActive: true,
        },
      ],
    });
    const result = await service.search({
      ...input,
      providerIds: ['provider-a'],
    });
    expect(result.slots.map((slot) => slot.localTime)).toEqual([
      '09:00',
      '10:30',
    ]);
  });
});
