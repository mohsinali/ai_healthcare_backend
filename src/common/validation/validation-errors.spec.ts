import { ValidationError } from 'class-validator';
import { flattenValidationErrors } from './validation-errors';

describe('flattenValidationErrors', () => {
  it('preserves multiple field names and safe messages', () => {
    const errors = [
      { property: 'phone', constraints: { isString: 'Phone is invalid.' } },
      {
        property: 'email',
        constraints: { isEmail: 'Enter a valid email address.' },
      },
    ] as ValidationError[];
    expect(flattenValidationErrors(errors)).toEqual([
      { field: 'phone', message: 'Phone is invalid.' },
      { field: 'email', message: 'Enter a valid email address.' },
    ]);
  });
});
