import { BadRequestException } from '@nestjs/common';
import { parsePhoneNumberFromString } from 'libphonenumber-js';

export function normalizedName(value: string): string {
  return value.trim().toLocaleLowerCase('en-US');
}
export function optionalText(value?: string | null): string | null | undefined {
  if (value === undefined) return undefined;
  if (value === null) return null;
  const text = value.trim();
  return text || null;
}
export function optionalEmail(
  value?: string | null,
): string | null | undefined {
  const text = optionalText(value);
  return typeof text === 'string' ? text.toLowerCase() : text;
}
export function phone(
  value: string | null | undefined,
  required = false,
): string | null | undefined {
  if (value === undefined) {
    if (required) throw new BadRequestException('Phone is required.');
    return undefined;
  }
  if (value === null) {
    if (required) throw new BadRequestException('Phone is required.');
    return null;
  }
  if (!value.trim() && !required) return null;
  const parsed = parsePhoneNumberFromString(value.trim());
  if (!parsed?.isValid())
    throw new BadRequestException('Enter a valid international phone number.');
  return parsed.number;
}
export function assertTimezone(value: string): string {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: value }).format();
  } catch {
    throw new BadRequestException('Enter a valid IANA timezone.');
  }
  return value;
}
