import { DateFormat } from '@prisma/client';
import { validate } from 'class-validator';
import { UpdateSettingsDto } from './settings.dto';

describe('UpdateSettingsDto', () => {
  it('accepts supported values', async () => {
    const dto = Object.assign(new UpdateSettingsDto(), {
      dateFormat: DateFormat.YYYY_MM_DD,
      timezone: 'Asia/Karachi',
    });
    await expect(validate(dto)).resolves.toHaveLength(0);
  });

  it('rejects arbitrary date formats and non-IANA timezones', async () => {
    const dto = Object.assign(new UpdateSettingsDto(), {
      dateFormat: 'YYYY/DD/MM',
      timezone: 'PST',
    });
    const errors = await validate(dto);
    expect(errors.map((error) => error.property)).toEqual(
      expect.arrayContaining(['dateFormat', 'timezone']),
    );
  });
});
