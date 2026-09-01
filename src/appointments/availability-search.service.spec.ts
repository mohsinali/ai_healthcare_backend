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
    } = {},
  ) {
    const prisma = {
      location: {
        findFirst: jest.fn().mockResolvedValue({
          name: 'Downtown Clinic',
          timezone: 'America/New_York',
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
          locationId: 'location-a',
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

  it('returns no slots without reading appointments when there are no eligible providers', async () => {
    const { service, prisma } = setup();
    prisma.provider.findMany.mockResolvedValue([]);
    await expect(service.search(input)).resolves.toMatchObject({ slots: [] });
    expect(prisma.appointment.findMany).not.toHaveBeenCalled();
  });
});
