import { FieldValidationException } from '../common/validation/field-validation.exception';
import { ProvidersService } from './providers.service';

describe('ProvidersService', () => {
  it('assigns a provider number during creation', async () => {
    const create = jest.fn((args: { data: Record<string, unknown> }) =>
      Promise.resolve(args.data),
    );
    const service = new ProvidersService(
      { provider: { create } } as never,
      {
        next: jest.fn().mockResolvedValue({ formatted: 'PRV-01', value: 1 }),
      } as never,
    );
    await expect(
      service.create({ tenantId: 'tenant-a' } as never, {
        firstName: 'Ada',
        lastName: 'Lovelace',
      }),
    ).resolves.toMatchObject({ providerNumber: 'PRV-01' });
  });

  it('associates an invalid provider phone with the phone field', async () => {
    const prisma = { provider: { create: jest.fn() } };
    const service = new ProvidersService(prisma as never, {} as never);

    const promise = service.create({ tenantId: 'tenant-a' } as never, {
      firstName: 'Ada',
      lastName: 'Lovelace',
      phone: 'asdfasdf',
    });
    await expect(promise).rejects.toBeInstanceOf(FieldValidationException);
    await expect(promise).rejects.toMatchObject({
      response: {
        message: 'Validation failed.',
        errors: [
          {
            field: 'phone',
            message: 'Enter a valid international phone number.',
          },
        ],
      },
    });
    expect(prisma.provider.create).not.toHaveBeenCalled();
  });
});
