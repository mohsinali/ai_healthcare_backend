import { DayOfWeek } from '@prisma/client';
import { usableAvailabilityWindows } from './availability-windows';

describe('usableAvailabilityWindows', () => {
  const hours = {
    dayOfWeek: DayOfWeek.MONDAY,
    isClosed: false,
    openTime: '09:00',
    closeTime: '17:00',
  };
  const period = (startTime: string, endTime: string, isActive = true) => ({
    dayOfWeek: DayOfWeek.MONDAY,
    startTime,
    endTime,
    isActive,
  });

  it('uses active provider periods as authoritative windows', () => {
    expect(
      usableAvailabilityWindows(
        DayOfWeek.MONDAY,
        [period('10:00', '12:00')],
        hours,
      ),
    ).toEqual([{ startTime: '10:00', endTime: '12:00' }]);
    expect(usableAvailabilityWindows(DayOfWeek.MONDAY, [], hours)).toEqual([]);
    expect(
      usableAvailabilityWindows(
        DayOfWeek.MONDAY,
        [period('10:00', '12:00', false)],
        hours,
      ),
    ).toEqual([]);
  });

  it('intersects periods with location hours as a safety boundary', () => {
    expect(
      usableAvailabilityWindows(
        DayOfWeek.MONDAY,
        [period('08:00', '18:00')],
        hours,
      ),
    ).toEqual([{ startTime: '09:00', endTime: '17:00' }]);
  });

  it('keeps split periods separate and merges adjacent or duplicate periods', () => {
    expect(
      usableAvailabilityWindows(
        DayOfWeek.MONDAY,
        [
          period('14:00', '17:00'),
          period('09:00', '12:00'),
          period('09:00', '12:00'),
        ],
        hours,
      ),
    ).toEqual([
      { startTime: '09:00', endTime: '12:00' },
      { startTime: '14:00', endTime: '17:00' },
    ]);
    expect(
      usableAvailabilityWindows(
        DayOfWeek.MONDAY,
        [period('09:00', '12:00'), period('12:00', '14:00')],
        hours,
      ),
    ).toEqual([{ startTime: '09:00', endTime: '14:00' }]);
  });

  it('returns no window for another weekday or closed location hours', () => {
    expect(
      usableAvailabilityWindows(
        DayOfWeek.TUESDAY,
        [period('09:00', '12:00')],
        hours,
      ),
    ).toEqual([]);
    expect(
      usableAvailabilityWindows(DayOfWeek.MONDAY, [period('09:00', '12:00')], {
        ...hours,
        isClosed: true,
      }),
    ).toEqual([]);
  });
});
