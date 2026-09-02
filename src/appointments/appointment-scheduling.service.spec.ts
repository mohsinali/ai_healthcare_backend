import { DayOfWeek } from '@prisma/client';
import { AppointmentsService } from './appointments.service';
import { appointmentSchedulingCodes } from './appointment-scheduling';

/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-return -- Jest mock calls and asymmetric matchers are typed as any. */

describe('AppointmentsService protected scheduling writes', () => {
  const context = { tenantId: 'tenant-a' } as never;
  const ids = {
    appointmentId: 'appointment-a',
    locationId: 'location-a',
    providerId: 'provider-z',
    serviceId: 'service-a',
    patientId: 'patient-a',
  };
  const hours = [
    {
      dayOfWeek: DayOfWeek.THURSDAY,
      isClosed: false,
      openTime: '09:00',
      closeTime: '17:00',
    },
  ];

  function setup(
    options: {
      periods?: Array<{
        dayOfWeek: DayOfWeek;
        startTime: string;
        endTime: string;
        isActive: boolean;
      }>;
      conflict?: boolean;
      current?: Record<string, unknown>;
    } = {},
  ) {
    const current = {
      id: ids.appointmentId,
      tenantId: 'tenant-a',
      patientId: ids.patientId,
      locationId: ids.locationId,
      providerId: ids.providerId,
      serviceId: ids.serviceId,
      startAt: new Date('2026-09-10T13:00:00Z'),
      endAt: new Date('2026-09-10T13:30:00Z'),
      status: 'BOOKED',
      ...options.current,
    };
    const tx = {
      $executeRaw: jest.fn(),
      location: {
        findFirst: jest.fn().mockResolvedValue({
          id: ids.locationId,
          name: 'Clinic',
          status: 'ACTIVE',
          timezone: 'America/New_York',
          businessHours: hours,
          locationServices: [{ id: 'location-service' }],
        }),
      },
      provider: {
        findFirst: jest.fn().mockResolvedValue({
          id: ids.providerId,
          firstName: 'Ada',
          lastName: 'Doctor',
          displayName: 'Dr Ada',
          title: null,
          status: 'ACTIVE',
          providerLocations: [{ id: 'provider-location' }],
          providerServices: [{ id: 'provider-service' }],
        }),
      },
      service: {
        findFirst: jest.fn().mockResolvedValue({
          id: ids.serviceId,
          name: 'Consultation',
          status: 'ACTIVE',
          durationMinutes: 30,
        }),
      },
      patient: {
        findFirst: jest.fn().mockResolvedValue({
          id: ids.patientId,
          status: 'ACTIVE',
        }),
      },
      providerWorkingPeriod: {
        findMany: jest.fn().mockResolvedValue(
          options.periods ?? [
            {
              dayOfWeek: DayOfWeek.THURSDAY,
              startTime: '09:00',
              endTime: '17:00',
              isActive: true,
            },
          ],
        ),
      },
      appointment: {
        findFirst: jest
          .fn()
          .mockResolvedValueOnce(current)
          .mockResolvedValue(options.conflict ? { id: 'conflict' } : null),
        create: jest.fn().mockResolvedValue({ id: ids.appointmentId }),
        update: jest.fn(),
      },
    };
    const prisma = {
      $transaction: jest.fn((work: (client: typeof tx) => unknown) => work(tx)),
      appointment: {
        findFirst: jest.fn().mockResolvedValue({
          ...current,
          location: { timezone: 'America/New_York' },
          provider: {},
          service: {},
          patient: {},
          events: [],
        }),
      },
    };
    const service = new AppointmentsService(
      prisma as never,
      {
        next: jest.fn().mockResolvedValue({ formatted: 'APT-001' }),
      } as never,
    );
    return { service, prisma, tx };
  }

  const createDto = {
    patientId: ids.patientId,
    locationId: ids.locationId,
    providerId: ids.providerId,
    serviceId: ids.serviceId,
    start: '2026-09-10T16:30:00-04:00',
  };

  it('books inside a period and allows an exact period-end boundary', async () => {
    const { service, tx } = setup({
      periods: [
        {
          dayOfWeek: DayOfWeek.THURSDAY,
          startTime: '16:00',
          endTime: '17:00',
          isActive: true,
        },
      ],
    });
    // Creation conflict lookup is the first appointment lookup in this path.
    tx.appointment.findFirst.mockReset().mockResolvedValue(null);
    await service.create(context, 'user-a', createDto);
    expect(tx.appointment.create).toHaveBeenCalledTimes(1);
    expect(tx.appointment.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          endAt: new Date('2026-09-10T21:00:00.000Z'),
        }),
      }),
    );
  });

  it('acquires location then provider locks before schedule and conflict reads', async () => {
    const { service, tx } = setup();
    tx.appointment.findFirst.mockReset().mockResolvedValue(null);
    await service.create(context, 'user-a', {
      ...createDto,
      start: '2026-09-10T10:00:00-04:00',
    });
    expect(tx.$executeRaw.mock.calls.map((call) => call[1])).toEqual([
      'clinic-config:location-schedule:tenant-a:location-a',
      'appointment-schedule:tenant-a:provider-z',
    ]);
    expect(tx.$executeRaw.mock.invocationCallOrder[1]).toBeLessThan(
      tx.providerWorkingPeriod.findMany.mock.invocationCallOrder[0],
    );
    expect(tx.$executeRaw.mock.invocationCallOrder[1]).toBeLessThan(
      tx.appointment.findFirst.mock.invocationCallOrder[0],
    );
  });

  it('rejects a missing schedule before conflict lookup or insertion', async () => {
    const { service, tx } = setup({ periods: [] });
    tx.appointment.findFirst.mockReset().mockResolvedValue(null);
    const promise = service.create(context, 'user-a', createDto);
    await expect(promise).rejects.toMatchObject({
      response: { code: appointmentSchedulingCodes.providerNotScheduled },
    });
    expect(tx.appointment.findFirst).not.toHaveBeenCalled();
    expect(tx.appointment.create).not.toHaveBeenCalled();
  });

  it('rejects a slot that bridges a positive split-period gap', async () => {
    const { service, tx } = setup({
      periods: [
        {
          dayOfWeek: DayOfWeek.THURSDAY,
          startTime: '09:00',
          endTime: '10:00',
          isActive: true,
        },
        {
          dayOfWeek: DayOfWeek.THURSDAY,
          startTime: '10:15',
          endTime: '12:00',
          isActive: true,
        },
      ],
    });
    tx.appointment.findFirst.mockReset().mockResolvedValue(null);
    await expect(
      service.create(context, 'user-a', {
        ...createDto,
        start: '2026-09-10T09:45:00-04:00',
      }),
    ).rejects.toMatchObject({
      response: {
        code: appointmentSchedulingCodes.outsideProviderSchedule,
      },
    });
    expect(tx.appointment.create).not.toHaveBeenCalled();
  });

  it('queries provider-wide UTC conflicts and returns safe details', async () => {
    const { service, tx } = setup({ conflict: true });
    tx.appointment.findFirst.mockReset().mockResolvedValue({ id: 'conflict' });
    const promise = service.create(context, 'user-a', {
      ...createDto,
      start: '2026-09-10T10:00:00-04:00',
    });
    await expect(promise).rejects.toMatchObject({
      response: {
        code: appointmentSchedulingCodes.slotUnavailable,
        details: {
          providerId: ids.providerId,
          locationId: ids.locationId,
          reason: appointmentSchedulingCodes.providerConflict,
        },
      },
    });
    expect(tx.appointment.findFirst).toHaveBeenCalledWith({
      where: {
        tenantId: 'tenant-a',
        providerId: ids.providerId,
        status: { in: ['BOOKED', 'CONFIRMED'] },
        startAt: { lt: new Date('2026-09-10T14:30:00.000Z') },
        endAt: { gt: new Date('2026-09-10T14:00:00.000Z') },
      },
      select: { id: true },
    });
    expect(tx.appointment.create).not.toHaveBeenCalled();
  });

  it('reschedules under record, location, and sorted old/new provider locks and excludes itself', async () => {
    const { service, tx } = setup();
    await service.reschedule(context, 'user-a', ids.appointmentId, {
      providerId: 'provider-a',
      start: '2026-09-10T11:00:00-04:00',
    });
    expect(tx.$executeRaw.mock.calls.map((call) => call[1])).toEqual([
      'appointment-record:tenant-a:appointment-a',
      'clinic-config:location-schedule:tenant-a:location-a',
      'appointment-schedule:tenant-a:provider-a',
      'appointment-schedule:tenant-a:provider-z',
    ]);
    expect(tx.appointment.findFirst).toHaveBeenLastCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ id: { not: ids.appointmentId } }),
      }),
    );
    expect(tx.appointment.update).toHaveBeenCalledTimes(1);
  });

  it('does not update when reschedule conflict validation fails', async () => {
    const { service, tx } = setup({ conflict: true });
    await expect(
      service.reschedule(context, 'user-a', ids.appointmentId, {
        start: '2026-09-10T11:00:00-04:00',
      }),
    ).rejects.toMatchObject({
      response: { code: appointmentSchedulingCodes.slotUnavailable },
    });
    expect(tx.appointment.update).not.toHaveBeenCalled();
  });

  it('serializes cancellation release with record then provider locks', async () => {
    const { service, tx } = setup();
    await service.cancel(context, 'user-a', ids.appointmentId, {});
    expect(tx.$executeRaw.mock.calls.map((call) => call[1])).toEqual([
      'appointment-record:tenant-a:appointment-a',
      'appointment-schedule:tenant-a:provider-z',
    ]);
    expect(tx.appointment.update).toHaveBeenCalledTimes(1);
  });
});
