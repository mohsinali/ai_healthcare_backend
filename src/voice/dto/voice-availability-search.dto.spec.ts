import { ValidationPipe } from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { VoiceAvailabilitySearchDto } from './voice-availability-search.dto';

describe('VoiceAvailabilitySearchDto', () => {
  it('trims names, treats a blank provider as absent, and accepts canonical filters', async () => {
    const dto = plainToInstance(VoiceAvailabilitySearchDto, {
      serviceName: ' General Consultation ',
      providerName: ' ',
      startDate: '2026-09-01',
      endDate: '2026-09-07',
      timeOfDay: 'morning',
    });
    await expect(validate(dto)).resolves.toHaveLength(0);
    expect(dto.serviceName).toBe('General Consultation');
    expect(dto.providerName).toBeUndefined();
  });

  it.each(['ANY', 'night', 'Morning'])(
    'rejects non-canonical timeOfDay %s',
    async (timeOfDay) => {
      await expect(
        validate(
          plainToInstance(VoiceAvailabilitySearchDto, {
            serviceName: 'Care',
            timeOfDay,
          }),
        ),
      ).resolves.not.toHaveLength(0);
    },
  );

  it('rejects missing, blank, oversized, and malformed fields', async () => {
    for (const value of [
      {},
      { serviceName: ' ' },
      { serviceName: 'x'.repeat(201) },
      { serviceName: 'Care', startDate: '09/01/2026' },
    ])
      await expect(
        validate(plainToInstance(VoiceAvailabilitySearchDto, value)),
      ).resolves.not.toHaveLength(0);
  });

  it.each([
    'tenantId',
    'clinicId',
    'locationId',
    'serviceId',
    'providerId',
    'patientId',
    'appointmentId',
    'durationMinutes',
    'timezone',
  ])('rejects caller-supplied internal field %s', async (property) => {
    const pipe = new ValidationPipe({
      transform: true,
      whitelist: true,
      forbidNonWhitelisted: true,
    });
    await expect(
      pipe.transform(
        { serviceName: 'Care', [property]: 'unsafe' },
        { type: 'body', metatype: VoiceAvailabilitySearchDto },
      ),
    ).rejects.toThrow();
  });
});
