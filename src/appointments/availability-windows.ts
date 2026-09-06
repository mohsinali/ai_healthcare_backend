import { DayOfWeek } from '@prisma/client';

export interface LocalAvailabilityPeriod {
  dayOfWeek: DayOfWeek;
  startTime: string;
  endTime: string;
  isActive: boolean;
}

export interface LocalOperatingHours {
  dayOfWeek: DayOfWeek;
  isClosed: boolean;
  openTime: string | null;
  closeTime: string | null;
}

export interface LocalAvailabilityWindow {
  startTime: string;
  endTime: string;
}

export function usableAvailabilityWindows(
  dayOfWeek: DayOfWeek,
  periods: LocalAvailabilityPeriod[],
  hours: LocalOperatingHours | undefined,
): LocalAvailabilityWindow[] {
  if (hours?.isClosed || !hours?.openTime || !hours.closeTime) return [];

  const intersections = periods
    .filter((period) => period.isActive && period.dayOfWeek === dayOfWeek)
    .map((period) => ({
      startTime:
        period.startTime > hours.openTime! ? period.startTime : hours.openTime!,
      endTime:
        period.endTime < hours.closeTime! ? period.endTime : hours.closeTime!,
    }))
    .filter((window) => window.startTime < window.endTime)
    .sort(
      (a, b) =>
        a.startTime.localeCompare(b.startTime) ||
        a.endTime.localeCompare(b.endTime),
    );

  const merged: LocalAvailabilityWindow[] = [];
  for (const window of intersections) {
    const previous = merged.at(-1);
    if (!previous || window.startTime > previous.endTime) {
      merged.push({ ...window });
      continue;
    }
    if (window.endTime > previous.endTime) previous.endTime = window.endTime;
  }
  return merged;
}
