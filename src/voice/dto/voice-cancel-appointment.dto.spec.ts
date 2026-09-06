import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { VoiceCancelAppointmentDto } from './voice-cancel-appointment.dto';

describe('VoiceCancelAppointmentDto', () => {
  it.each([true, false])('accepts strict boolean %s', async (confirmed) => {
    await expect(
      validate(plainToInstance(VoiceCancelAppointmentDto, { confirmed })),
    ).resolves.toHaveLength(0);
  });

  it.each(['true', 'false', 1, null, undefined])(
    'rejects non-boolean confirmation %p',
    async (confirmed) => {
      expect(
        await validate(
          plainToInstance(VoiceCancelAppointmentDto, { confirmed }),
        ),
      ).not.toHaveLength(0);
    },
  );
});
