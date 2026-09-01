import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { VoiceFaqSearchDto } from './voice-faq-search.dto';

describe('VoiceFaqSearchDto', () => {
  it('trims a valid concise query', async () => {
    const dto = plainToInstance(VoiceFaqSearchDto, { query: '  parking  ' });
    await expect(validate(dto)).resolves.toHaveLength(0);
    expect(dto.query).toBe('parking');
  });

  it.each([{ query: '' }, { query: '   ' }, { query: 'x'.repeat(501) }, {}])(
    'rejects invalid query %#',
    async (input) => {
      const errors = await validate(plainToInstance(VoiceFaqSearchDto, input));
      expect(errors.length).toBeGreaterThan(0);
    },
  );

  it('defines no caller-controlled routing fields', () => {
    expect(Object.getOwnPropertyNames(new VoiceFaqSearchDto())).toEqual([
      'query',
    ]);
  });
});
