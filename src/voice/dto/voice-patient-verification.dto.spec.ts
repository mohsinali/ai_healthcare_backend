import { ValidationPipe } from '@nestjs/common';
import {
  VoiceIdentifyPatientDto,
  VoiceVerifyPatientDto,
} from './voice-patient-verification.dto';

describe('patient verification voice DTOs', () => {
  const pipe = new ValidationPipe({
    whitelist: true,
    forbidNonWhitelisted: true,
    transform: true,
  });

  it.each([
    ['tenantId', 'tenant-a'],
    ['patientId', 'patient-a'],
    ['candidatePatientIds', ['patient-a']],
    ['voiceSessionId', 'session-a'],
    ['redisKey', 'key'],
    ['widgetId', 'widget-a'],
    ['locationId', 'location-a'],
    ['verificationAttemptCount', 0],
    ['locked', false],
    ['verified', false],
  ])('rejects internal identify_patient property %s', async (field, value) => {
    await expect(
      pipe.transform(
        {
          firstName: 'Jane',
          lastName: 'Doe',
          dateOfBirth: '1985-04-17',
          [field]: value,
        },
        { type: 'body', metatype: VoiceIdentifyPatientDto },
      ),
    ).rejects.toMatchObject({ status: 400 });
  });

  it.each(['', '   ', '1985-2-17', '04/17/1985', '1985-04-17T00:00:00Z'])(
    'rejects invalid identify_patient input without echoing it: %j',
    async (value) => {
      const input =
        value.startsWith('1985') || value.includes('/')
          ? { firstName: 'Jane', lastName: 'Doe', dateOfBirth: value }
          : { firstName: value, lastName: 'Doe', dateOfBirth: '1985-04-17' };
      try {
        await pipe.transform(input, {
          type: 'body',
          metatype: VoiceIdentifyPatientDto,
        });
        throw new Error('Expected validation to fail.');
      } catch (error) {
        if (value) expect(JSON.stringify(error)).not.toContain(value);
      }
    },
  );

  it('rejects internal verify_patient properties', async () => {
    await expect(
      pipe.transform(
        { phoneNumber: '+1 416 555 0123', patientId: 'patient-a' },
        { type: 'body', metatype: VoiceVerifyPatientDto },
      ),
    ).rejects.toMatchObject({ status: 400 });
  });
});
