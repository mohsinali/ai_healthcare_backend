import { BadRequestException } from '@nestjs/common';
import {
  assertTimezone,
  normalizedName,
  optionalEmail,
  phone,
} from './clinic-config.helpers';

describe('clinic configuration normalization', () => {
  it('normalizes names and emails without changing display values', () => {
    expect(normalizedName(' Main Clinic ')).toBe('main clinic');
    expect(optionalEmail(' ADMIN@EXAMPLE.COM ')).toBe('admin@example.com');
  });
  it('normalizes valid international phone numbers to E.164', () => {
    expect(phone('+1 (305) 555-0123')).toBe('+13055550123');
  });
  it('rejects invalid phone numbers and timezones', () => {
    expect(() => phone('123')).toThrow(BadRequestException);
    expect(() => assertTimezone('EST-ish')).toThrow(BadRequestException);
  });
  it('accepts IANA timezones', () => {
    expect(assertTimezone('America/New_York')).toBe('America/New_York');
  });
  it('safely preserves explicit null optional values', () => {
    expect(optionalEmail(null)).toBeNull();
    expect(phone(null)).toBeNull();
  });
});
