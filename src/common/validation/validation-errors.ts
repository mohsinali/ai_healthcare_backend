import { ValidationError } from 'class-validator';
import { FieldValidationError } from './field-validation.exception';

export function flattenValidationErrors(
  errors: ValidationError[],
  parent = '',
): FieldValidationError[] {
  return errors.flatMap((error) => {
    const field = parent ? `${parent}.${error.property}` : error.property;
    const own = Object.values(error.constraints ?? {}).map((message) => ({
      field,
      message,
    }));
    return [...own, ...flattenValidationErrors(error.children ?? [], field)];
  });
}
