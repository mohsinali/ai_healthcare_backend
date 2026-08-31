import { BadRequestException } from '@nestjs/common';
import { normalizedName, phone } from '../clinic-config/clinic-config.helpers';
import { FieldValidationException } from '../common/validation/field-validation.exception';

export const normalizePatientName = (value: string): string =>
  normalizedName(value.trim());

export function parsePatientDateOfBirth(value: string): Date {
  const date = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(date.valueOf()) || date.toISOString().slice(0, 10) !== value)
    throw new FieldValidationException([
      { field: 'dateOfBirth', message: 'Enter a valid date of birth.' },
    ]);
  if (value > new Date().toISOString().slice(0, 10))
    throw new FieldValidationException([
      {
        field: 'dateOfBirth',
        message: 'Date of birth cannot be in the future.',
      },
    ]);
  return date;
}

export function normalizePatientPhone(
  value: string,
  field = 'phoneNumber',
): string {
  try {
    return phone(value, true)!;
  } catch (error) {
    if (error instanceof BadRequestException)
      throw new FieldValidationException([
        {
          field,
          message: 'Enter a valid international phone number.',
        },
      ]);
    throw error;
  }
}
