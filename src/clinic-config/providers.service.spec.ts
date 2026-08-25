import { FieldValidationException } from '../common/validation/field-validation.exception';
import { ProvidersService } from './providers.service';

describe('ProvidersService', () => {
  it('searches all provider name and title fields case-insensitively', async () => {
    const findMany = jest.fn().mockResolvedValue([]);
    const count = jest.fn().mockResolvedValue(0);
    const prisma = {
      provider: { findMany, count },
      $transaction: jest.fn((operations: Promise<unknown>[]) =>
        Promise.all(operations),
      ),
    };
    const service = new ProvidersService(prisma as never, {} as never);

    await expect(
      service.list({ tenantId: 'tenant-a' } as never, {
        page: 2,
        limit: 10,
        search: '  Cardio  ',
      }),
    ).resolves.toEqual({
      data: [],
      meta: { page: 2, limit: 10, total: 0, totalPages: 0 },
    });

    const where = {
      tenantId: 'tenant-a',
      OR: [
        { firstName: { contains: 'Cardio', mode: 'insensitive' } },
        { lastName: { contains: 'Cardio', mode: 'insensitive' } },
        { displayName: { contains: 'Cardio', mode: 'insensitive' } },
        { title: { contains: 'Cardio', mode: 'insensitive' } },
        { providerNumber: { contains: 'Cardio', mode: 'insensitive' } },
      ],
    };
    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where, skip: 10, take: 10 }),
    );
    expect(count).toHaveBeenCalledWith({ where });
  });

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
