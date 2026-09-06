import { ConfigurationStatus, DayOfWeek } from '@prisma/client';
import {
  findPeriodsOutsideLocationHours,
  findProviderPeriodOverlaps,
  scheduleConflictCodes,
} from './scheduling-invariants';

describe('scheduling invariants', () => {
  const mondayHours = [
    {
      dayOfWeek: DayOfWeek.MONDAY,
      isClosed: false,
      openTime: '09:00',
      closeTime: '17:00',
    },
  ];
  const period = (
    startTime: string,
    endTime: string,
    extra: Partial<{
      dayOfWeek: DayOfWeek;
      isActive: boolean;
    }> = {},
  ) => ({
    dayOfWeek: DayOfWeek.MONDAY,
    startTime,
    endTime,
    isActive: true,
    ...extra,
  });

  it.each([
    ['inside', period('10:00', '14:00')],
    ['equal boundaries', period('09:00', '17:00')],
  ])('accepts a period %s location hours', (_label, value) => {
    expect(
      findPeriodsOutsideLocationHours(
        [value],
        mondayHours,
        'location-a',
        ConfigurationStatus.ACTIVE,
      ),
    ).toEqual([]);
  });

  it.each([
    ['before opening', period('08:30', '12:00')],
    ['after closing', period('16:00', '18:00')],
    [
      'on an unscheduled weekday',
      period('10:00', '12:00', { dayOfWeek: DayOfWeek.TUESDAY }),
    ],
  ])('rejects a period %s', (_label, value) => {
    expect(
      findPeriodsOutsideLocationHours(
        [value],
        mondayHours,
        'location-a',
        ConfigurationStatus.ACTIVE,
      ),
    ).toHaveLength(1);
  });

  it('rejects active periods at closed or inactive locations', () => {
    expect(
      findPeriodsOutsideLocationHours(
        [period('10:00', '12:00')],
        [{ ...mondayHours[0], isClosed: true }],
        'location-a',
        ConfigurationStatus.ACTIVE,
      ),
    ).toHaveLength(1);
    expect(
      findPeriodsOutsideLocationHours(
        [period('10:00', '12:00')],
        mondayHours,
        'location-a',
        ConfigurationStatus.INACTIVE,
      ),
    ).toHaveLength(1);
  });

  it('ignores inactive periods for containment', () => {
    expect(
      findPeriodsOutsideLocationHours(
        [period('01:00', '02:00', { isActive: false })],
        mondayHours,
        'location-a',
        ConfigurationStatus.ACTIVE,
      ),
    ).toEqual([]);
  });

  it.each([
    ['non-overlapping', [period('09:00', '12:00'), period('13:00', '14:00')]],
    ['adjacent', [period('09:00', '12:00'), period('12:00', '14:00')]],
    [
      'different weekdays',
      [
        period('09:00', '12:00'),
        period('09:00', '12:00', { dayOfWeek: DayOfWeek.TUESDAY }),
      ],
    ],
    [
      'inactive overlap',
      [period('09:00', '12:00'), period('10:00', '11:00', { isActive: false })],
    ],
  ])('accepts %s periods', (_label, periods) => {
    expect(findProviderPeriodOverlaps(periods, 'location-a')).toEqual([]);
  });

  it.each([
    ['partial', [period('09:00', '12:00'), period('11:00', '14:00')]],
    ['contained', [period('09:00', '17:00'), period('12:00', '14:00')]],
    ['identical', [period('09:00', '12:00'), period('09:00', '12:00')]],
  ])('detects %s overlap', (_label, periods) => {
    expect(findProviderPeriodOverlaps(periods, 'location-a')).toEqual([
      expect.objectContaining({ type: scheduleConflictCodes.overlap }),
    ]);
  });

  it('reports the same deterministic overlap regardless of request order', () => {
    const periods = [period('12:00', '14:00'), period('09:00', '17:00')];
    expect(findProviderPeriodOverlaps(periods, 'location-a')).toEqual(
      findProviderPeriodOverlaps([...periods].reverse(), 'location-a'),
    );
  });
});
