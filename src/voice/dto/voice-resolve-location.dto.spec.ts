import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { VoiceResolveLocationDto } from './voice-resolve-location.dto';

describe('VoiceResolveLocationDto', () => {
  it('trims and accepts only a non-empty query of at most 200 characters', async () => {
    const valid = plainToInstance(VoiceResolveLocationDto, {
      query: ' Clifton ',
    });
    expect(valid.query).toBe('Clifton');
    expect(await validate(valid)).toHaveLength(0);
    expect(
      await validate(
        plainToInstance(VoiceResolveLocationDto, { query: '   ' }),
      ),
    ).not.toHaveLength(0);
    expect(
      await validate(
        plainToInstance(VoiceResolveLocationDto, { query: 'x'.repeat(201) }),
      ),
    ).not.toHaveLength(0);
  });
});
