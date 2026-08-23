import { BadRequestException } from '@nestjs/common';
export const MIN_PASSWORD_LENGTH = 12;
export function assertPasswordPolicy(password: string): void {
  if (
    typeof password !== 'string' ||
    password.trim().length < MIN_PASSWORD_LENGTH
  )
    throw new BadRequestException(
      `Password must be at least ${MIN_PASSWORD_LENGTH} characters.`,
    );
}
