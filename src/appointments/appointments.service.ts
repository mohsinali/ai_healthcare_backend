import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  AppointmentStatus,
  ConfigurationStatus,
  DayOfWeek,
  PatientStatus,
  Prisma,
  SequenceType,
} from '@prisma/client';
import { DateTime } from 'luxon';
import { PrismaService } from '../database/prisma.service';
import { SequenceService } from '../sequences/sequence.service';
import { TrustedTenantContext } from '../tenants/types/tenant-context';
import {
  AvailabilityDto,
  CreateAppointmentDto,
  EligibleProvidersDto,
  ListAppointmentsDto,
  RescheduleAppointmentDto,
  UpdateAppointmentDto,
} from './dto/appointment.dto';
import { usableAvailabilityWindows } from './availability-windows';
import { AVAILABILITY_BLOCKING_STATUSES } from './availability-search.service';
import {
  appointmentSchedulingCodes,
  AppointmentSchedulingException,
  lockAppointmentRecord,
  lockProviderAppointmentSchedules,
} from './appointment-scheduling';
import { lockLocationSchedule } from '../clinic-config/scheduling-invariants';

export const APPOINTMENT_SLOT_INTERVAL_MINUTES = 15;
const CONFLICT_MESSAGE =
  'That appointment time is no longer available. Please select another time.';
const dayNames: Record<number, DayOfWeek> = {
  1: 'MONDAY',
  2: 'TUESDAY',
  3: 'WEDNESDAY',
  4: 'THURSDAY',
  5: 'FRIDAY',
  6: 'SATURDAY',
  7: 'SUNDAY',
};
const appointmentInclude = {
  patient: {
    select: {
      id: true,
      firstName: true,
      middleName: true,
      lastName: true,
      dateOfBirth: true,
      phone: true,
      email: true,
      status: true,
    },
  },
  location: { select: { id: true, name: true, timezone: true, status: true } },
  provider: {
    select: {
      id: true,
      firstName: true,
      lastName: true,
      displayName: true,
      title: true,
      status: true,
    },
  },
  service: {
    select: { id: true, name: true, durationMinutes: true, status: true },
  },
} satisfies Prisma.AppointmentInclude;

@Injectable()
export class AppointmentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly sequences: SequenceService,
  ) {}

  eligibleProviders(c: TrustedTenantContext, dto: EligibleProvidersDto) {
    return this.prisma.provider.findMany({
      where: {
        tenantId: c.tenantId,
        status: 'ACTIVE',
        providerLocations: { some: { locationId: dto.locationId } },
        providerServices: { some: { serviceId: dto.serviceId } },
        tenant: {
          locations: {
            some: {
              id: dto.locationId,
              status: 'ACTIVE',
              locationServices: { some: { serviceId: dto.serviceId } },
            },
          },
          services: { some: { id: dto.serviceId, status: 'ACTIVE' } },
        },
      },
      orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
    });
  }

  async availability(c: TrustedTenantContext, dto: AvailabilityDto) {
    const config = await this.configuration(
      this.prisma,
      c.tenantId,
      dto.locationId,
      dto.providerId,
      dto.serviceId,
    );
    const day = this.localDay(dto.date, config.location.timezone);
    const hours = config.location.businessHours.find(
      (h) => h.dayOfWeek === dayNames[day.weekday],
    );
    const periods = await this.prisma.providerWorkingPeriod.findMany({
      where: {
        tenantId: c.tenantId,
        providerId: dto.providerId,
        locationId: dto.locationId,
        dayOfWeek: dayNames[day.weekday],
        isActive: true,
      },
      select: {
        dayOfWeek: true,
        startTime: true,
        endTime: true,
        isActive: true,
      },
    });
    const windows = usableAvailabilityWindows(
      dayNames[day.weekday],
      periods,
      hours,
    );
    if (!windows.length)
      return {
        date: dto.date,
        timezone: config.location.timezone,
        durationMinutes: config.service.durationMinutes,
        slotIntervalMinutes: APPOINTMENT_SLOT_INTERVAL_MINUTES,
        slots: [],
      };
    const queryStart = day.startOf('day').toUTC();
    const queryEnd = day.plus({ days: 1 }).startOf('day').toUTC();
    const appointments = await this.prisma.appointment.findMany({
      where: {
        tenantId: c.tenantId,
        providerId: dto.providerId,
        status: { in: AVAILABILITY_BLOCKING_STATUSES },
        startAt: { lt: queryEnd.toJSDate() },
        endAt: { gt: queryStart.toJSDate() },
      },
      select: { startAt: true, endAt: true },
    });
    const slots: { start: string; end: string }[] = [];
    for (const window of windows) {
      const open = this.availabilityWallTime(
        dto.date,
        window.startTime,
        config.location.timezone,
      );
      const close = this.availabilityWallTime(
        dto.date,
        window.endTime,
        config.location.timezone,
      );
      if (!open || !close) continue;
      for (
        let cursor = open;
        cursor.plus({ minutes: config.service.durationMinutes }).toMillis() <=
        close.toMillis();
        cursor = cursor.plus({ minutes: APPOINTMENT_SLOT_INTERVAL_MINUTES })
      ) {
        // Ambiguous fallback wall times are omitted; explicit offset-aware booking remains supported.
        if (cursor.getPossibleOffsets().length > 1) continue;
        const end = cursor.plus({ minutes: config.service.durationMinutes });
        if (
          !appointments.some(
            (a) =>
              cursor.toMillis() < a.endAt.valueOf() &&
              end.toMillis() > a.startAt.valueOf(),
          )
        )
          slots.push({ start: cursor.toISO(), end: end.toISO() });
      }
    }
    return {
      date: dto.date,
      timezone: config.location.timezone,
      durationMinutes: config.service.durationMinutes,
      slotIntervalMinutes: APPOINTMENT_SLOT_INTERVAL_MINUTES,
      slots,
    };
  }

  async create(
    c: TrustedTenantContext,
    userId: string,
    dto: CreateAppointmentDto,
  ) {
    const id = await this.prisma.$transaction(
      async (tx) => {
        await lockLocationSchedule(tx, c.tenantId, dto.locationId);
        await lockProviderAppointmentSchedules(tx, c.tenantId, [
          dto.providerId,
        ]);
        const config = await this.configuration(
          tx,
          c.tenantId,
          dto.locationId,
          dto.providerId,
          dto.serviceId,
          dto.patientId,
        );
        const range = this.range(
          dto.start,
          config.location.timezone,
          config.service.durationMinutes,
        );
        await this.validateSchedulingWindow(
          tx,
          c.tenantId,
          dto.locationId,
          dto.providerId,
          config.location.businessHours,
          config.location.timezone,
          range,
        );
        await this.ensureNoConflict(
          tx,
          c.tenantId,
          dto.locationId,
          dto.providerId,
          range.start,
          range.end,
        );
        // Allocate independently so an appointment write failure never recycles
        // a business identifier. Gaps are intentional and safe.
        const sequence = await this.sequences.next(
          c.tenantId,
          SequenceType.APPOINTMENT,
        );
        const appointment = await tx.appointment.create({
          data: {
            tenantId: c.tenantId,
            appointmentNumber: sequence.formatted,
            patientId: dto.patientId,
            locationId: dto.locationId,
            providerId: dto.providerId,
            serviceId: dto.serviceId,
            startAt: range.start,
            endAt: range.end,
            reason: this.text(dto.reason),
            notes: this.text(dto.notes),
            createdByUserId: userId,
            events: { create: { type: 'CREATED', actorUserId: userId } },
          },
          select: { id: true },
        });
        return appointment.id;
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted },
    );
    return this.get(c, id);
  }

  async bookVerifiedPatient(input: {
    tenantId: string;
    patientId: string;
    locationId: string;
    serviceId: string;
    providerId: string;
    appointmentDate: string;
    startTime: string;
    now?: Date;
  }) {
    return this.prisma.$transaction(
      async (tx) => {
        await lockLocationSchedule(tx, input.tenantId, input.locationId);
        await lockProviderAppointmentSchedules(tx, input.tenantId, [
          input.providerId,
        ]);
        const config = await this.configuration(
          tx,
          input.tenantId,
          input.locationId,
          input.providerId,
          input.serviceId,
          input.patientId,
        );
        const localStart = this.wallTime(
          input.appointmentDate,
          input.startTime,
          config.location.timezone,
          true,
        );
        if (localStart.minute % APPOINTMENT_SLOT_INTERVAL_MINUTES !== 0)
          throw new BadRequestException('Enter a valid appointment time.');
        const range = {
          start: localStart.toUTC().toJSDate(),
          end: localStart
            .plus({ minutes: config.service.durationMinutes })
            .toUTC()
            .toJSDate(),
          localDate: input.appointmentDate,
        };
        if (range.start.valueOf() <= (input.now ?? new Date()).valueOf())
          throw new BadRequestException(
            'Appointment time must be in the future.',
          );

        await this.validateSchedulingWindow(
          tx,
          input.tenantId,
          input.locationId,
          input.providerId,
          config.location.businessHours,
          config.location.timezone,
          range,
        );

        const duplicate = await tx.appointment.findFirst({
          where: {
            tenantId: input.tenantId,
            patientId: input.patientId,
            locationId: input.locationId,
            serviceId: input.serviceId,
            providerId: input.providerId,
            startAt: range.start,
            status: { in: ['BOOKED', 'CONFIRMED'] },
          },
          select: { appointmentNumber: true },
        });
        if (duplicate)
          return {
            appointmentNumber: duplicate.appointmentNumber,
            locationName: config.location.name,
            serviceName: config.service.name,
            providerName: this.providerName(config.provider),
            timezone: config.location.timezone,
            duplicate: true,
          };

        await this.ensureNoConflict(
          tx,
          input.tenantId,
          input.locationId,
          input.providerId,
          range.start,
          range.end,
        );
        const sequence = await this.sequences.next(
          input.tenantId,
          SequenceType.APPOINTMENT,
        );
        const appointment = await tx.appointment.create({
          data: {
            tenantId: input.tenantId,
            appointmentNumber: sequence.formatted,
            patientId: input.patientId,
            locationId: input.locationId,
            providerId: input.providerId,
            serviceId: input.serviceId,
            startAt: range.start,
            endAt: range.end,
            events: { create: { type: 'CREATED' } },
          },
          select: { appointmentNumber: true },
        });
        return {
          appointmentNumber: appointment.appointmentNumber,
          locationName: config.location.name,
          serviceName: config.service.name,
          providerName: this.providerName(config.provider),
          timezone: config.location.timezone,
          duplicate: false,
        };
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted },
    );
  }

  async list(c: TrustedTenantContext, q: ListAppointmentsDto) {
    const search = q.search?.trim();
    const where: Prisma.AppointmentWhereInput = {
      tenantId: c.tenantId,
      ...(q.status ? { status: q.status } : {}),
      ...(q.locationId ? { locationId: q.locationId } : {}),
      ...(q.providerId ? { providerId: q.providerId } : {}),
      ...(q.serviceId ? { serviceId: q.serviceId } : {}),
      ...(q.patientId ? { patientId: q.patientId } : {}),
      ...(q.dateFrom || q.dateTo
        ? {
            startAt: {
              ...(q.dateFrom
                ? { gte: new Date(`${q.dateFrom}T00:00:00.000Z`) }
                : {}),
              ...(q.dateTo
                ? {
                    lt: new Date(
                      `${DateTime.fromISO(q.dateTo, { zone: 'utc' }).plus({ days: 1 }).toISODate()}T00:00:00.000Z`,
                    ),
                  }
                : {}),
            },
          }
        : {}),
      ...(search
        ? {
            OR: [
              { appointmentNumber: { contains: search, mode: 'insensitive' } },
              {
                patient: {
                  is: {
                    OR: [
                      { firstName: { contains: search, mode: 'insensitive' } },
                      { lastName: { contains: search, mode: 'insensitive' } },
                      { phone: { contains: search } },
                    ],
                  },
                },
              },
            ],
          }
        : {}),
    };
    const [data, total] = await this.prisma.$transaction([
      this.prisma.appointment.findMany({
        where,
        include: appointmentInclude,
        orderBy: [{ startAt: 'asc' }, { id: 'asc' }],
        skip: (q.page - 1) * q.limit,
        take: q.limit,
      }),
      this.prisma.appointment.count({ where }),
    ]);
    return {
      data: data.map((x) => ({
        ...this.present(x),
        reason: undefined,
        notes: undefined,
        cancellationReason: undefined,
      })),
      meta: {
        page: q.page,
        limit: q.limit,
        total,
        totalPages: Math.ceil(total / q.limit),
      },
    };
  }

  async get(c: TrustedTenantContext, id: string) {
    const value = await this.prisma.appointment.findFirst({
      where: { id, tenantId: c.tenantId },
      include: {
        ...appointmentInclude,
        events: {
          orderBy: [{ occurredAt: 'desc' as const }, { id: 'desc' as const }],
          select: { id: true, type: true, occurredAt: true, metadata: true },
        },
      },
    });
    if (!value) throw new NotFoundException('Appointment not found.');
    return this.present(value);
  }

  async update(c: TrustedTenantContext, id: string, dto: UpdateAppointmentDto) {
    await this.get(c, id);
    await this.prisma.appointment.update({
      where: { tenantId_id: { tenantId: c.tenantId, id } },
      data: {
        ...(dto.reason !== undefined ? { reason: this.text(dto.reason) } : {}),
        ...(dto.notes !== undefined ? { notes: this.text(dto.notes) } : {}),
      },
    });
    return this.get(c, id);
  }

  async reschedule(
    c: TrustedTenantContext,
    userId: string,
    id: string,
    dto: RescheduleAppointmentDto,
  ) {
    await this.prisma.$transaction(async (tx) => {
      await lockAppointmentRecord(tx, c.tenantId, id);
      const current = await tx.appointment.findFirst({
        where: { id, tenantId: c.tenantId },
      });
      if (!current) throw new NotFoundException('Appointment not found.');
      if (current.status === 'CANCELLED')
        throw new ConflictException(
          'A cancelled appointment cannot be rescheduled.',
        );
      if (this.terminal(current.status))
        throw new ConflictException(
          'This appointment can no longer be rescheduled.',
        );
      const providerId = dto.providerId ?? current.providerId;
      await lockLocationSchedule(tx, c.tenantId, current.locationId);
      await lockProviderAppointmentSchedules(tx, c.tenantId, [
        current.providerId,
        providerId,
      ]);
      const config = await this.configuration(
        tx,
        c.tenantId,
        current.locationId,
        providerId,
        current.serviceId,
        current.patientId,
      );
      const range = this.range(
        dto.start,
        config.location.timezone,
        config.service.durationMinutes,
      );
      await this.validateSchedulingWindow(
        tx,
        c.tenantId,
        current.locationId,
        providerId,
        config.location.businessHours,
        config.location.timezone,
        range,
      );
      await this.ensureNoConflict(
        tx,
        c.tenantId,
        current.locationId,
        providerId,
        range.start,
        range.end,
        id,
      );
      await tx.appointment.update({
        where: { tenantId_id: { tenantId: c.tenantId, id } },
        data: {
          providerId,
          startAt: range.start,
          endAt: range.end,
          events: {
            create: {
              type: 'RESCHEDULED',
              actorUserId: userId,
              metadata: {
                oldStartAt: current.startAt.toISOString(),
                oldEndAt: current.endAt.toISOString(),
                newStartAt: range.start.toISOString(),
                newEndAt: range.end.toISOString(),
                oldProviderId: current.providerId,
                newProviderId: providerId,
              },
            },
          },
        },
      });
    });
    return this.get(c, id);
  }

  async cancel(
    c: TrustedTenantContext,
    userId: string,
    id: string,
    dto: { reason?: string | null },
  ) {
    await this.prisma.$transaction(async (tx) => {
      await lockAppointmentRecord(tx, c.tenantId, id);
      const current = await tx.appointment.findFirst({
        where: { id, tenantId: c.tenantId },
      });
      if (!current) throw new NotFoundException('Appointment not found.');
      if (current.status === 'CANCELLED') return;
      if (this.terminal(current.status))
        throw new ConflictException(
          'This appointment can no longer be cancelled.',
        );
      await lockProviderAppointmentSchedules(tx, c.tenantId, [
        current.providerId,
      ]);
      await tx.appointment.update({
        where: { tenantId_id: { tenantId: c.tenantId, id } },
        data: {
          status: 'CANCELLED',
          cancelledAt: new Date(),
          cancelledByUserId: userId,
          cancellationReason: this.text(dto.reason),
          events: {
            create: {
              type: 'CANCELLED',
              actorUserId: userId,
              metadata: dto.reason?.trim()
                ? { reason: dto.reason.trim() }
                : undefined,
            },
          },
        },
      });
    });
    return this.get(c, id);
  }

  async confirm(c: TrustedTenantContext, userId: string, id: string) {
    await this.prisma.$transaction(async (tx) => {
      await lockAppointmentRecord(tx, c.tenantId, id);
      const current = await tx.appointment.findFirst({
        where: { id, tenantId: c.tenantId },
      });
      if (!current) throw new NotFoundException('Appointment not found.');
      if (current.status === 'CONFIRMED') return;
      if (current.status !== 'BOOKED')
        throw new ConflictException(
          'Only a booked appointment can be confirmed.',
        );
      await tx.appointment.update({
        where: { tenantId_id: { tenantId: c.tenantId, id } },
        data: {
          status: 'CONFIRMED',
          confirmedAt: new Date(),
          events: { create: { type: 'CONFIRMED', actorUserId: userId } },
        },
      });
    });
    return this.get(c, id);
  }

  private async configuration(
    db: PrismaService | Prisma.TransactionClient,
    tenantId: string,
    locationId: string,
    providerId: string,
    serviceId: string,
    patientId?: string,
  ) {
    const [location, provider, service, patient] = await Promise.all([
      db.location.findFirst({
        where: { id: locationId, tenantId },
        include: {
          businessHours: true,
          locationServices: { where: { serviceId }, select: { id: true } },
        },
      }),
      db.provider.findFirst({
        where: { id: providerId, tenantId },
        include: {
          providerLocations: { where: { locationId }, select: { id: true } },
          providerServices: { where: { serviceId }, select: { id: true } },
        },
      }),
      db.service.findFirst({ where: { id: serviceId, tenantId } }),
      patientId
        ? db.patient.findFirst({ where: { id: patientId, tenantId } })
        : Promise.resolve(null),
    ]);
    if (!location) throw new NotFoundException('Location not found.');
    if (!provider) throw new NotFoundException('Provider not found.');
    if (!service) throw new NotFoundException('Service not found.');
    if (patientId && !patient)
      throw new NotFoundException('Patient not found.');
    if (location.status !== ConfigurationStatus.ACTIVE)
      throw new BadRequestException('Location must be active.');
    if (provider.status !== ConfigurationStatus.ACTIVE)
      throw new BadRequestException('Provider must be active.');
    if (service.status !== ConfigurationStatus.ACTIVE)
      throw new BadRequestException('Service must be active.');
    if (patient && patient.status !== PatientStatus.ACTIVE)
      throw new BadRequestException('Patient must be active.');
    if (!location.locationServices.length)
      throw new BadRequestException('Service is not offered at this location.');
    if (!provider.providerLocations.length)
      throw new BadRequestException(
        'Provider is not assigned to this location.',
      );
    if (!provider.providerServices.length)
      throw new BadRequestException(
        'Provider is not assigned to this service.',
      );
    return { location, provider, service, patient };
  }

  private range(input: string, zone: string, durationMinutes: number) {
    if (!/(Z|[+-]\d{2}:\d{2})$/.test(input))
      throw new BadRequestException(
        'Appointment start must include a timezone offset.',
      );
    const supplied = DateTime.fromISO(input, { setZone: true });
    if (!supplied.isValid)
      throw new BadRequestException('Enter a valid appointment time.');
    const local = supplied.setZone(zone);
    if (
      supplied.offset !== local.offset ||
      supplied.toFormat("yyyy-MM-dd'T'HH:mm") !==
        local.toFormat("yyyy-MM-dd'T'HH:mm")
    )
      throw new BadRequestException(
        'Appointment time must use the Location timezone.',
      );
    return {
      start: supplied.toUTC().toJSDate(),
      end: supplied.plus({ minutes: durationMinutes }).toUTC().toJSDate(),
      localDate: local.toISODate()!,
    };
  }

  private validateHours(
    hours: {
      dayOfWeek: DayOfWeek;
      isClosed: boolean;
      openTime: string | null;
      closeTime: string | null;
    }[],
    range: { start: Date; end: Date; localDate: string },
    zone: string,
  ) {
    const day = this.localDay(range.localDate, zone);
    const value = hours.find((h) => h.dayOfWeek === dayNames[day.weekday]);
    if (!value || value.isClosed || !value.openTime || !value.closeTime)
      throw new BadRequestException(
        'The Location is closed at the selected time.',
      );
    const open = this.wallTime(range.localDate, value.openTime, zone, true)
      .toUTC()
      .toMillis();
    const close = this.wallTime(range.localDate, value.closeTime, zone, true)
      .toUTC()
      .toMillis();
    if (range.start.valueOf() < open || range.end.valueOf() > close)
      throw new BadRequestException(
        'Appointment must fit within Location Business Hours.',
      );
  }

  private async validateSchedulingWindow(
    tx: Prisma.TransactionClient,
    tenantId: string,
    locationId: string,
    providerId: string,
    hours: {
      dayOfWeek: DayOfWeek;
      isClosed: boolean;
      openTime: string | null;
      closeTime: string | null;
    }[],
    zone: string,
    range: { start: Date; end: Date; localDate: string },
  ) {
    const details = {
      providerId,
      locationId,
      requestedStart: range.start.toISOString(),
      requestedEnd: range.end.toISOString(),
    };
    try {
      this.validateHours(hours, range, zone);
    } catch (error) {
      if (error instanceof BadRequestException)
        throw new AppointmentSchedulingException(
          appointmentSchedulingCodes.outsideLocationHours,
          details,
          'Appointment must fit within Location Business Hours.',
        );
      throw error;
    }

    const day = this.localDay(range.localDate, zone);
    const dayOfWeek = dayNames[day.weekday];
    const periods = await tx.providerWorkingPeriod.findMany({
      where: {
        tenantId,
        providerId,
        locationId,
        dayOfWeek,
        isActive: true,
      },
      select: {
        dayOfWeek: true,
        startTime: true,
        endTime: true,
        isActive: true,
      },
    });
    if (!periods.length)
      throw new AppointmentSchedulingException(
        appointmentSchedulingCodes.providerNotScheduled,
        details,
        'Provider has no active working period at this time.',
      );

    const operatingHours = hours.find((value) => value.dayOfWeek === dayOfWeek);
    const windows = usableAvailabilityWindows(
      dayOfWeek,
      periods,
      operatingHours,
    );
    const contained = windows.some((window) => {
      const start = this.wallTime(range.localDate, window.startTime, zone, true)
        .toUTC()
        .toMillis();
      const end = this.wallTime(range.localDate, window.endTime, zone, true)
        .toUTC()
        .toMillis();
      return range.start.valueOf() >= start && range.end.valueOf() <= end;
    });
    if (!contained)
      throw new AppointmentSchedulingException(
        appointmentSchedulingCodes.outsideProviderSchedule,
        details,
        'Appointment must fit within the Provider working schedule.',
      );
  }

  private localDay(date: string, zone: string) {
    const value = DateTime.fromISO(date, { zone });
    if (!value.isValid || value.toISODate() !== date)
      throw new BadRequestException('Enter a valid date.');
    return value;
  }

  private wallTime(
    date: string,
    time: string,
    zone: string,
    rejectAmbiguous: boolean,
  ) {
    const value = DateTime.fromISO(`${date}T${time}`, { zone, setZone: true });
    if (
      !value.isValid ||
      value.toFormat('yyyy-MM-dd HH:mm') !== `${date} ${time}` ||
      (rejectAmbiguous && value.getPossibleOffsets().length > 1)
    )
      throw new BadRequestException(
        'The selected local time is invalid or ambiguous in the Location timezone.',
      );
    return value;
  }

  private availabilityWallTime(date: string, time: string, zone: string) {
    try {
      return this.wallTime(date, time, zone, false);
    } catch (error) {
      if (error instanceof BadRequestException) return null;
      throw error;
    }
  }

  private async ensureNoConflict(
    tx: Prisma.TransactionClient,
    tenantId: string,
    locationId: string,
    providerId: string,
    startAt: Date,
    endAt: Date,
    excludeId?: string,
  ) {
    const conflict = await tx.appointment.findFirst({
      where: {
        tenantId,
        providerId,
        status: { in: AVAILABILITY_BLOCKING_STATUSES },
        ...(excludeId ? { id: { not: excludeId } } : {}),
        startAt: { lt: endAt },
        endAt: { gt: startAt },
      },
      select: { id: true },
    });
    if (conflict)
      throw new AppointmentSchedulingException(
        appointmentSchedulingCodes.slotUnavailable,
        {
          providerId,
          locationId,
          requestedStart: startAt.toISOString(),
          requestedEnd: endAt.toISOString(),
          reason: appointmentSchedulingCodes.providerConflict,
        },
        CONFLICT_MESSAGE,
      );
  }

  private present<
    T extends { startAt: Date; endAt: Date; location: { timezone: string } },
  >(value: T) {
    return {
      ...value,
      localStart: DateTime.fromJSDate(value.startAt)
        .setZone(value.location.timezone)
        .toISO(),
      localEnd: DateTime.fromJSDate(value.endAt)
        .setZone(value.location.timezone)
        .toISO(),
      timezone: value.location.timezone,
    };
  }
  private providerName(provider: {
    firstName: string;
    lastName: string;
    displayName: string | null;
    title: string | null;
  }) {
    return (
      provider.displayName ??
      [provider.title, provider.firstName, provider.lastName]
        .filter(Boolean)
        .join(' ')
    );
  }
  private terminal(status: AppointmentStatus) {
    return status === 'COMPLETED' || status === 'NO_SHOW';
  }
  private text(value?: string | null) {
    return value?.trim() || null;
  }
}
