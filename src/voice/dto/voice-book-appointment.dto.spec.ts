import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { VoiceBookAppointmentDto } from './voice-book-appointment.dto';

describe('VoiceBookAppointmentDto', () => {
  const valid = {
    serviceName: 'General Consultation',
    providerName: 'Dr. Sarah Ahmed',
    appointmentDate: '2026-09-10',
    startTime: '10:30',
    confirmed: true,
  };

  it('accepts the public local date/time representation', async () => {
    await expect(
      validate(plainToInstance(VoiceBookAppointmentDto, valid)),
    ).resolves.toHaveLength(0);
  });

  it('allows omitted confirmation so the tool can return confirmation_required', async () => {
    await expect(
      validate(
        plainToInstance(VoiceBookAppointmentDto, {
          ...valid,
          confirmed: undefined,
        }),
      ),
    ).resolves.toHaveLength(0);
  });

  it.each([
    [{ ...valid, confirmed: 'true' }],
    [{ ...valid, appointmentDate: '09/10/2026' }],
    [{ ...valid, startTime: '10:30:00' }],
  ])('rejects invalid booking input', async (input) => {
    expect(
      await validate(plainToInstance(VoiceBookAppointmentDto, input)),
    ).not.toHaveLength(0);
  });
});
