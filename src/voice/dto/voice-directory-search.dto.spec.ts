import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { ValidationPipe } from '@nestjs/common';
import { VoiceProviderSearchDto } from './voice-provider-search.dto';
import { VoiceServiceSearchDto } from './voice-service-search.dto';

describe('voice directory DTOs', () => {
  it('allows omitted and whitespace-only optional search strings', async () => {
    const services = plainToInstance(VoiceServiceSearchDto, { query: '   ' });
    const providers = plainToInstance(VoiceProviderSearchDto, {
      query: ' ',
      serviceName: '  General Consultation  ',
    });
    await expect(validate(services)).resolves.toHaveLength(0);
    await expect(validate(providers)).resolves.toHaveLength(0);
    expect(services.query).toBeUndefined();
    expect(providers.query).toBeUndefined();
    expect(providers.serviceName).toBe('General Consultation');
  });

  it('rejects oversized strings', async () => {
    const services = await validate(
      plainToInstance(VoiceServiceSearchDto, { query: 'x'.repeat(201) }),
    );
    const providers = await validate(
      plainToInstance(VoiceProviderSearchDto, {
        serviceName: 'x'.repeat(201),
      }),
    );
    expect(services).not.toHaveLength(0);
    expect(providers).not.toHaveLength(0);
  });

  it('defines no caller-controlled routing or internal identifier fields', () => {
    expect(Object.getOwnPropertyNames(new VoiceServiceSearchDto())).toEqual([
      'query',
    ]);
    expect(Object.getOwnPropertyNames(new VoiceProviderSearchDto())).toEqual([
      'query',
      'serviceName',
    ]);
  });

  it.each(['tenantId', 'clinicId', 'locationId', 'providerId', 'serviceId'])(
    'global validation rejects caller-supplied %s',
    async (property) => {
      const pipe = new ValidationPipe({
        transform: true,
        whitelist: true,
        forbidNonWhitelisted: true,
      });
      await expect(
        pipe.transform(
          { query: 'care', [property]: 'caller-controlled' },
          { type: 'body', metatype: VoiceServiceSearchDto },
        ),
      ).rejects.toThrow();
    },
  );
});
