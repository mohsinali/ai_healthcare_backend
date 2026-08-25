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
} from '@prisma/client';
import { DateTime } from 'luxon';
import { PrismaService } from '../database/prisma.service';
import { TrustedTenantContext } from '../tenants/types/tenant-context';
import {
  AvailabilityDto,
  CreateAppointmentDto,
  EligibleProvidersDto,
  ListAppointmentsDto,
  RescheduleAppointmentDto,
  UpdateAppointmentDto,
} from './dto/appointment.dto';

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
  constructor(private readonly prisma: PrismaService) {}

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
    if (!hours || hours.isClosed || !hours.openTime || !hours.closeTime)
      return {
        date: dto.date,
        timezone: config.location.timezone,
        durationMinutes: config.service.durationMinutes,
        slotIntervalMinutes: APPOINTMENT_SLOT_INTERVAL_MINUTES,
        slots: [],
      };
    const open = this.wallTime(
      dto.date,
      hours.openTime,
      config.location.timezone,
      false,
    );
    const close = this.wallTime(
      dto.date,
      hours.closeTime,
      config.location.timezone,
      false,
    );
    const appointments = await this.prisma.appointment.findMany({
      where: {
        tenantId: c.tenantId,
        providerId: dto.providerId,
        status: { not: 'CANCELLED' },
        startAt: { lt: close.toJSDate() },
        endAt: { gt: open.toJSDate() },
      },
      select: { startAt: true, endAt: true },
    });
    const slots: { start: string; end: string }[] = [];
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
        await this.lock(tx, c.tenantId, dto.providerId, range.localDate);
        this.validateHours(
          config.location.businessHours,
          range,
          config.location.timezone,
        );
        await this.ensureNoConflict(
          tx,
          c.tenantId,
          dto.providerId,
          range.start,
          range.end,
        );
        const sequence = await tx.appointmentSequence.upsert({
          where: { tenantId: c.tenantId },
          create: { tenantId: c.tenantId, nextValue: 2 },
          update: { nextValue: { increment: 1 } },
        });
        const appointment = await tx.appointment.create({
          data: {
            tenantId: c.tenantId,
            appointmentNumber: `APT-${String(sequence.nextValue - 1).padStart(6, '0')}`,
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
      const lockDates = [
        ...new Set([
          DateTime.fromJSDate(current.startAt)
            .setZone(config.location.timezone)
            .toISODate()!,
          range.localDate,
        ]),
      ].sort();
      for (const date of lockDates)
        await this.lock(tx, c.tenantId, providerId, date);
      this.validateHours(
        config.location.businessHours,
        range,
        config.location.timezone,
      );
      await this.ensureNoConflict(
        tx,
        c.tenantId,
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
      const current = await tx.appointment.findFirst({
        where: { id, tenantId: c.tenantId },
      });
      if (!current) throw new NotFoundException('Appointment not found.');
      if (current.status === 'CANCELLED') return;
      if (this.terminal(current.status))
        throw new ConflictException(
          'This appointment can no longer be cancelled.',
        );
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

  private async lock(
    tx: Prisma.TransactionClient,
    tenantId: string,
    providerId: string,
    localDate: string,
  ) {
    // pg_advisory_xact_lock returns PostgreSQL `void`. Using $queryRaw makes
    // Prisma try to deserialize that unsupported result type (P2010). Execute
    // it without returning rows; the lock is still blocking and is released
    // automatically when this transaction ends.
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`${tenantId}:${providerId}:${localDate}`}, 0::bigint))`;
  }

  private async ensureNoConflict(
    tx: Prisma.TransactionClient,
    tenantId: string,
    providerId: string,
    startAt: Date,
    endAt: Date,
    excludeId?: string,
  ) {
    const conflict = await tx.appointment.findFirst({
      where: {
        tenantId,
        providerId,
        status: { not: 'CANCELLED' },
        ...(excludeId ? { id: { not: excludeId } } : {}),
        startAt: { lt: endAt },
        endAt: { gt: startAt },
      },
      select: { id: true },
    });
    if (conflict) throw new ConflictException(CONFLICT_MESSAGE);
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
  private terminal(status: AppointmentStatus) {
    return status === 'COMPLETED' || status === 'NO_SHOW';
  }
  private text(value?: string | null) {
    return value?.trim() || null;
  }
}
