import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { VoiceRescheduleAppointmentDto } from './voice-reschedule-appointment.dto';

describe('VoiceRescheduleAppointmentDto', () => {
  const valid = {
    appointmentDate: '2026-09-12',
    startTime: '14:30',
    confirmed: false,
  };

  it('accepts strict local date/time and a boolean confirmation', async () => {
    await expect(
      validate(plainToInstance(VoiceRescheduleAppointmentDto, valid)),
    ).resolves.toHaveLength(0);
  });

  it.each([
    { ...valid, appointmentDate: '2026-9-12' },
    { ...valid, startTime: '4:30' },
    { ...valid, confirmed: 'true' },
    { ...valid, confirmed: undefined },
  ])('rejects malformed input %#', async (input) => {
    expect(
      await validate(plainToInstance(VoiceRescheduleAppointmentDto, input)),
    ).not.toHaveLength(0);
  });
});
