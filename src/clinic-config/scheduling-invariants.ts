import { BadRequestException } from '@nestjs/common';
import { ConfigurationStatus, DayOfWeek, Prisma } from '@prisma/client';

const weekdayOrder = new Map(
  Object.values(DayOfWeek).map((day, index) => [day, index]),
);

export const scheduleConflictCodes = {
  overlap: 'PROVIDER_PERIOD_OVERLAP',
  outsideHours: 'PROVIDER_PERIOD_OUTSIDE_LOCATION_HOURS',
  locationHours: 'LOCATION_HOURS_PROVIDER_PERIOD_CONFLICT',
} as const;

export interface SchedulePeriod {
  dayOfWeek: DayOfWeek;
  startTime: string;
  endTime: string;
  isActive?: boolean;
}

export interface OperatingHour {
  dayOfWeek: DayOfWeek;
  isClosed: boolean;
  openTime?: string | null;
  closeTime?: string | null;
}

export interface ScheduleConflict {
  type: (typeof scheduleConflictCodes)[keyof typeof scheduleConflictCodes];
  providerId?: string;
  providerName?: string;
  locationId: string;
  dayOfWeek: DayOfWeek;
  startTime: string;
  endTime: string;
  conflictingStartTime?: string;
  conflictingEndTime?: string;
  proposedOpenTime?: string | null;
  proposedCloseTime?: string | null;
}

export class ScheduleInvariantException extends BadRequestException {
  constructor(code: ScheduleConflict['type'], conflicts: ScheduleConflict[]) {
    super({
      message: 'Schedule validation failed.',
      code,
      conflicts: sortScheduleConflicts(conflicts),
    });
  }
}

export function sortSchedulePeriods<T extends SchedulePeriod>(periods: T[]) {
  return [...periods].sort(comparePeriods);
}

export function findProviderPeriodOverlaps(
  periods: SchedulePeriod[],
  locationId: string,
): ScheduleConflict[] {
  const active = sortSchedulePeriods(
    periods.filter((period) => period.isActive !== false),
  );
  const conflicts: ScheduleConflict[] = [];
  let previous: SchedulePeriod | undefined;
  for (const current of active) {
    if (!previous || previous.dayOfWeek !== current.dayOfWeek) {
      previous = current;
      continue;
    }
    if (current.startTime < previous.endTime) {
      conflicts.push({
        type: scheduleConflictCodes.overlap,
        locationId,
        dayOfWeek: current.dayOfWeek,
        startTime: current.startTime,
        endTime: current.endTime,
        conflictingStartTime: previous.startTime,
        conflictingEndTime: previous.endTime,
      });
    }
    if (current.endTime > previous.endTime) previous = current;
  }
  return conflicts;
}

export function findPeriodsOutsideLocationHours(
  periods: SchedulePeriod[],
  hours: OperatingHour[],
  locationId: string,
  locationStatus: ConfigurationStatus,
  type: ScheduleConflict['type'] = scheduleConflictCodes.outsideHours,
  provider?: { id: string; name?: string },
): ScheduleConflict[] {
  const hoursByDay = new Map(hours.map((hour) => [hour.dayOfWeek, hour]));
  return sortSchedulePeriods(
    periods.filter((period) => period.isActive !== false),
  )
    .filter((period) => {
      const hour = hoursByDay.get(period.dayOfWeek);
      return (
        locationStatus !== ConfigurationStatus.ACTIVE ||
        !hour ||
        hour.isClosed ||
        !hour.openTime ||
        !hour.closeTime ||
        period.startTime < hour.openTime ||
        period.endTime > hour.closeTime
      );
    })
    .map((period) => {
      const hour = hoursByDay.get(period.dayOfWeek);
      return {
        type,
        providerId: provider?.id,
        providerName: provider?.name,
        locationId,
        dayOfWeek: period.dayOfWeek,
        startTime: period.startTime,
        endTime: period.endTime,
        proposedOpenTime:
          locationStatus === ConfigurationStatus.ACTIVE && !hour?.isClosed
            ? (hour?.openTime ?? null)
            : null,
        proposedCloseTime:
          locationStatus === ConfigurationStatus.ACTIVE && !hour?.isClosed
            ? (hour?.closeTime ?? null)
            : null,
      };
    });
}

export async function lockLocationSchedule(
  tx: Prisma.TransactionClient,
  tenantId: string,
  locationId: string,
) {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`clinic-config:location-schedule:${tenantId}:${locationId}`}, 0::bigint))`;
}

function comparePeriods(a: SchedulePeriod, b: SchedulePeriod) {
  return (
    weekdayOrder.get(a.dayOfWeek)! - weekdayOrder.get(b.dayOfWeek)! ||
    a.startTime.localeCompare(b.startTime) ||
    a.endTime.localeCompare(b.endTime)
  );
}

function sortScheduleConflicts(conflicts: ScheduleConflict[]) {
  return [...conflicts].sort(
    (a, b) =>
      weekdayOrder.get(a.dayOfWeek)! - weekdayOrder.get(b.dayOfWeek)! ||
      (a.providerId ?? '').localeCompare(b.providerId ?? '') ||
      a.startTime.localeCompare(b.startTime) ||
      a.endTime.localeCompare(b.endTime),
  );
}
