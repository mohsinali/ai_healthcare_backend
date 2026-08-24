import { FieldValidationException } from '../common/validation/field-validation.exception';
import { ProvidersService } from './providers.service';

describe('ProvidersService', () => {
  it('associates an invalid provider phone with the phone field', () => {
    const prisma = { provider: { create: jest.fn() } };
    const service = new ProvidersService(prisma as never);

    let caught: unknown;
    try {
      void service.create({ tenantId: 'tenant-a' } as never, {
        firstName: 'Ada',
        lastName: 'Lovelace',
        phone: 'asdfasdf',
      });
    } catch (error) {
      caught = error;
    }

    expect(caught).toBeInstanceOf(FieldValidationException);
    expect((caught as FieldValidationException).getResponse()).toEqual({
      message: 'Validation failed.',
      errors: [
        {
          field: 'phone',
          message: 'Enter a valid international phone number.',
        },
      ],
    });
    expect(prisma.provider.create).not.toHaveBeenCalled();
  });
});
