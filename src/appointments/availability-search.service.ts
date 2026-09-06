import { BadRequestException, Injectable } from '@nestjs/common';
import {
  AppointmentStatus,
  ConfigurationStatus,
  DayOfWeek,
} from '@prisma/client';
import { DateTime } from 'luxon';
import { PrismaService } from '../database/prisma.service';
import { usableAvailabilityWindows } from './availability-windows';

export const AVAILABILITY_SLOT_INTERVAL_MINUTES = 15;
export const AVAILABILITY_DEFAULT_WINDOW_DAYS = 7;
export const AVAILABILITY_MAX_WINDOW_DAYS = 14;
export const AVAILABILITY_RESULT_LIMIT = 5;
export const AVAILABILITY_BLOCKING_STATUSES: AppointmentStatus[] = [
  AppointmentStatus.BOOKED,
  AppointmentStatus.CONFIRMED,
];

export type AvailabilityTimeOfDay = 'any' | 'morning' | 'afternoon' | 'evening';

export interface AvailabilitySearchInput {
  tenantId: string;
  locationId: string;
  serviceId: string;
  providerIds: string[];
  startDate?: string;
  endDate?: string;
  timeOfDay?: AvailabilityTimeOfDay;
  now?: Date;
}

export interface AvailabilitySearchSlot {
  providerId: string;
  providerName: string;
  localDate: string;
  localTime: string;
  startsAt: string;
  endsAt: string;
}

const DAY_NAMES: Record<number, DayOfWeek> = {
  1: DayOfWeek.MONDAY,
  2: DayOfWeek.TUESDAY,
  3: DayOfWeek.WEDNESDAY,
  4: DayOfWeek.THURSDAY,
  5: DayOfWeek.FRIDAY,
  6: DayOfWeek.SATURDAY,
  7: DayOfWeek.SUNDAY,
};

@Injectable()
export class AvailabilitySearchService {
  constructor(private readonly prisma: PrismaService) {}

  async search(input: AvailabilitySearchInput): Promise<{
    location: { name: string; timezone: string };
    service: { name: string; durationMinutes: number };
    slots: AvailabilitySearchSlot[];
  }> {
    const location = await this.prisma.location.findFirst({
      where: {
        id: input.locationId,
        tenantId: input.tenantId,
        status: ConfigurationStatus.ACTIVE,
      },
      select: {
        name: true,
        timezone: true,
        businessHours: {
          where: { tenantId: input.tenantId },
          select: {
            dayOfWeek: true,
            isClosed: true,
            openTime: true,
            closeTime: true,
          },
        },
      },
    });
    if (!location) throw new BadRequestException('Location is unavailable.');

    const service = await this.prisma.service.findFirst({
      where: {
        id: input.serviceId,
        tenantId: input.tenantId,
        status: ConfigurationStatus.ACTIVE,
        durationMinutes: { gt: 0 },
        locationServices: {
          some: {
            tenantId: input.tenantId,
            locationId: input.locationId,
          },
        },
      },
      select: { name: true, durationMinutes: true },
    });
    if (!service) throw new BadRequestException('Service is unavailable.');

    const providers = await this.prisma.provider.findMany({
      where: {
        id: { in: input.providerIds },
        tenantId: input.tenantId,
        status: ConfigurationStatus.ACTIVE,
        providerLocations: {
          some: {
            tenantId: input.tenantId,
            locationId: input.locationId,
          },
        },
        providerServices: {
          some: { tenantId: input.tenantId, serviceId: input.serviceId },
        },
      },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        displayName: true,
        title: true,
      },
    });
    const namedProviders = providers.map((provider) => ({
      id: provider.id,
      name:
        provider.displayName ??
        [provider.title, provider.firstName, provider.lastName]
          .filter(Boolean)
          .join(' '),
    }));

    const now = DateTime.fromJSDate(input.now ?? new Date()).setZone(
      location.timezone,
    );
    if (!now.isValid)
      throw new BadRequestException('Location timezone is invalid.');
    const start = this.date(
      input.startDate ?? now.toISODate(),
      location.timezone,
    );
    const end = this.date(
      input.endDate ??
        start.plus({ days: AVAILABILITY_DEFAULT_WINDOW_DAYS - 1 }).toISODate()!,
      location.timezone,
    );
    const rangeDays = Math.round(end.diff(start, 'days').days) + 1;
    if (rangeDays < 1)
      throw new BadRequestException('endDate must be on or after startDate.');
    if (rangeDays > AVAILABILITY_MAX_WINDOW_DAYS)
      throw new BadRequestException(
        `Date range cannot exceed ${AVAILABILITY_MAX_WINDOW_DAYS} days.`,
      );

    if (!namedProviders.length) return { location, service, slots: [] };

    const queryStart = start.startOf('day').toUTC();
    const queryEnd = end.plus({ days: 1 }).startOf('day').toUTC();
    const weekdays = new Set<DayOfWeek>();
    for (
      let day = start;
      day.toMillis() <= end.toMillis();
      day = day.plus({ days: 1 })
    )
      weekdays.add(DAY_NAMES[day.weekday]);
    const providerIds = namedProviders.map(({ id }) => id);
    const [periods, appointments] = await Promise.all([
      this.prisma.providerWorkingPeriod.findMany({
        where: {
          tenantId: input.tenantId,
          locationId: input.locationId,
          providerId: { in: providerIds },
          dayOfWeek: { in: [...weekdays] },
          isActive: true,
        },
        select: {
          providerId: true,
          dayOfWeek: true,
          startTime: true,
          endTime: true,
          isActive: true,
        },
      }),
      this.prisma.appointment.findMany({
        where: {
          tenantId: input.tenantId,
          providerId: { in: providerIds },
          status: { in: AVAILABILITY_BLOCKING_STATUSES },
          startAt: { lt: queryEnd.toJSDate() },
          endAt: { gt: queryStart.toJSDate() },
        },
        select: { providerId: true, startAt: true, endAt: true },
      }),
    ]);

    const slots: AvailabilitySearchSlot[] = [];
    for (
      let day = start;
      day.toMillis() <= end.toMillis();
      day = day.plus({ days: 1 })
    ) {
      const date = day.toISODate()!;
      const hours = location.businessHours.find(
        (value) => value.dayOfWeek === DAY_NAMES[day.weekday],
      );
      for (const provider of namedProviders) {
        const windows = usableAvailabilityWindows(
          DAY_NAMES[day.weekday],
          periods.filter((period) => period.providerId === provider.id),
          hours,
        );
        for (const window of windows) {
          const open = this.wallTime(date, window.startTime, location.timezone);
          const close = this.wallTime(date, window.endTime, location.timezone);
          if (!open || !close) continue;
          for (
            let cursor = open;
            cursor.plus({ minutes: service.durationMinutes }).toMillis() <=
            close.toMillis();
            cursor = cursor.plus({
              minutes: AVAILABILITY_SLOT_INTERVAL_MINUTES,
            })
          ) {
            if (
              cursor.getPossibleOffsets().length > 1 ||
              cursor.toMillis() <= now.toMillis()
            )
              continue;
            if (!this.matchesTimeOfDay(cursor, input.timeOfDay ?? 'any'))
              continue;
            const slotEnd = cursor.plus({ minutes: service.durationMinutes });
            const conflict = appointments.some(
              (appointment) =>
                appointment.providerId === provider.id &&
                appointment.startAt.valueOf() < slotEnd.toMillis() &&
                appointment.endAt.valueOf() > cursor.toMillis(),
            );
            if (!conflict) {
              slots.push({
                providerId: provider.id,
                providerName: provider.name,
                localDate: date,
                localTime: cursor.toFormat('HH:mm'),
                startsAt: cursor.toISO()!,
                endsAt: slotEnd.toISO()!,
              });
            }
          }
        }
      }
    }
    slots.sort(
      (a, b) =>
        DateTime.fromISO(a.startsAt).toMillis() -
          DateTime.fromISO(b.startsAt).toMillis() ||
        a.providerName.localeCompare(b.providerName) ||
        a.providerId.localeCompare(b.providerId),
    );
    return {
      location,
      service,
      slots: slots.slice(0, AVAILABILITY_RESULT_LIMIT),
    };
  }

  private date(value: string, zone: string): DateTime {
    const parsed = DateTime.fromISO(value, { zone });
    if (!parsed.isValid || parsed.toISODate() !== value)
      throw new BadRequestException('Dates must be valid YYYY-MM-DD values.');
    return parsed.startOf('day');
  }

  private wallTime(date: string, time: string, zone: string): DateTime | null {
    const parsed = DateTime.fromISO(`${date}T${time}`, { zone, setZone: true });
    if (
      !parsed.isValid ||
      parsed.toFormat('yyyy-MM-dd HH:mm') !== `${date} ${time}`
    )
      return null;
    return parsed;
  }

  private matchesTimeOfDay(value: DateTime, filter: AvailabilityTimeOfDay) {
    if (filter === 'any') return true;
    if (filter === 'morning') return value.hour < 12;
    if (filter === 'afternoon') return value.hour >= 12 && value.hour < 17;
    return value.hour >= 17;
  }
}
