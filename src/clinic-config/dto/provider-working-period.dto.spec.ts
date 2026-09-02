import { DayOfWeek } from '@prisma/client';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { ReplaceProviderWorkingPeriodsDto } from './clinic-config.dto';

describe('ReplaceProviderWorkingPeriodsDto', () => {
  it('accepts multiple same-day periods and defaults isActive to true', async () => {
    const dto = plainToInstance(ReplaceProviderWorkingPeriodsDto, {
      periods: [
        { dayOfWeek: DayOfWeek.MONDAY, startTime: '09:00', endTime: '12:00' },
        { dayOfWeek: DayOfWeek.MONDAY, startTime: '13:00', endTime: '17:00' },
      ],
    });
    await expect(validate(dto)).resolves.toEqual([]);
    expect(dto.periods.map((period) => period.isActive)).toEqual([true, true]);
  });

  it.each([
    [
      'invalid weekday',
      { dayOfWeek: 'FUNDAY', startTime: '09:00', endTime: '10:00' },
    ],
    [
      'non-padded hour',
      { dayOfWeek: DayOfWeek.MONDAY, startTime: '9:00', endTime: '10:00' },
    ],
    [
      'invalid minute',
      { dayOfWeek: DayOfWeek.MONDAY, startTime: '09:60', endTime: '10:00' },
    ],
  ])('rejects %s', async (_label, period) => {
    const dto = plainToInstance(ReplaceProviderWorkingPeriodsDto, {
      periods: [period],
    });
    await expect(validate(dto)).resolves.not.toEqual([]);
  });
});
