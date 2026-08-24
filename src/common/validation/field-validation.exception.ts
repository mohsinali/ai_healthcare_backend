import { BadRequestException } from '@nestjs/common';

export interface FieldValidationError {
  field: string;
  message: string;
}

export class FieldValidationException extends BadRequestException {
  constructor(errors: FieldValidationError[]) {
    super({ message: 'Validation failed.', errors });
  }
}
