import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { VoiceAppointmentSearchDto } from './voice-appointment-search.dto';

describe('VoiceAppointmentSearchDto', () => {
  it('accepts no filters and trims optional strings', async () => {
    await expect(
      validate(plainToInstance(VoiceAppointmentSearchDto, {})),
    ).resolves.toHaveLength(0);
    const dto = plainToInstance(VoiceAppointmentSearchDto, {
      appointmentReference: '  APT-1  ',
      providerName: '  Dr. Ali  ',
      locationName: '   ',
    });
    await expect(validate(dto)).resolves.toHaveLength(0);
    expect(dto).toMatchObject({
      appointmentReference: 'APT-1',
      providerName: 'Dr. Ali',
      locationName: undefined,
    });
  });

  it.each(['2026-9-04', '04-09-2026', '2026-09-04T00:00:00Z'])(
    'rejects non-YYYY-MM-DD date syntax: %s',
    async (startDate) => {
      expect(
        await validate(
          plainToInstance(VoiceAppointmentSearchDto, { startDate }),
        ),
      ).not.toHaveLength(0);
    },
  );

  it('enforces safe string bounds', async () => {
    expect(
      await validate(
        plainToInstance(VoiceAppointmentSearchDto, {
          appointmentReference: 'x'.repeat(101),
          providerName: 'x'.repeat(201),
          locationName: 'x'.repeat(201),
        }),
      ),
    ).toHaveLength(3);
  });
});
