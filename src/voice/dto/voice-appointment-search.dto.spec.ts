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
          appointmentReference: `APT${'1'.repeat(30)}`,
          providerName: 'x'.repeat(201),
          locationName: 'x'.repeat(201),
        }),
      ),
    ).toHaveLength(3);
  });

  it.each(['APT06', 'APT-06', 'apt 06', '  APT06  '])(
    'accepts plausible spoken appointment reference %s',
    async (appointmentReference) => {
      expect(
        await validate(
          plainToInstance(VoiceAppointmentSearchDto, {
            appointmentReference,
          }),
        ),
      ).toHaveLength(0);
    },
  );

  it.each(['', '   ', 'APT/06', 'APT_06', 'APT--06', 'APT  06', 106])(
    'rejects empty, unsafe, unreasonable, or non-string reference %p',
    async (appointmentReference) => {
      expect(
        await validate(
          plainToInstance(VoiceAppointmentSearchDto, {
            appointmentReference,
          }),
        ),
      ).not.toHaveLength(0);
    },
  );
});
