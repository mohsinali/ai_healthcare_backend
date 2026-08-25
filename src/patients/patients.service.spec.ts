import { ConflictException } from '@nestjs/common';
import { PatientsService } from './patients.service';
import { FieldValidationException } from '../common/validation/field-validation.exception';

describe('PatientsService', () => {
  const tenantId = '11111111-1111-4111-8111-111111111111';
  const ctx = { tenantId } as never;
  const dto = {
    firstName: ' Sarah ',
    lastName: ' Johnson ',
    dateOfBirth: '1988-04-12',
    phone: '+13055550123',
    email: ' SARAH@EXAMPLE.COM ',
  };
  it('derives tenant ownership and normalizes create data', async () => {
    const prisma = {
      patient: {
        findMany: jest.fn().mockResolvedValue([]),
        // Jest's generic mock payload is intentionally dynamic at this Prisma boundary.
        // eslint-disable-next-line @typescript-eslint/no-unsafe-return
        create: jest.fn().mockImplementation(({ data }) => data),
      },
    } as never;
    const result = await new PatientsService(prisma, {
      next: jest.fn().mockResolvedValue({ formatted: 'PAT-01', value: 1 }),
    } as never).create(ctx, dto);
    expect(result).toMatchObject({
      tenantId,
      patientNumber: 'PAT-01',
      firstName: 'Sarah',
      lastName: 'Johnson',
      phone: '+13055550123',
      email: 'sarah@example.com',
    });
  });
  it('warns instead of silently creating a duplicate', async () => {
    const next = jest.fn();
    const prisma = {
      patient: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'p1',
            firstName: 'Sarah',
            middleName: null,
            lastName: 'Johnson',
            dateOfBirth: new Date('1988-04-12T00:00:00Z'),
            phone: '+13055550123',
            email: null,
            status: 'ACTIVE',
          },
        ]),
        create: jest.fn(),
      },
    } as never;
    await expect(
      new PatientsService(prisma, { next } as never).create(ctx, dto),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(next).not.toHaveBeenCalled();
    expect(
      (prisma as { patient: { create: jest.Mock } }).patient.create,
    ).not.toHaveBeenCalled();
  });
  it('associates an invalid create phone with the phone field', async () => {
    const prisma = {
      patient: { findMany: jest.fn(), create: jest.fn() },
    } as never;
    const promise = new PatientsService(prisma, {} as never).create(ctx, {
      ...dto,
      phone: '3055550123',
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
  });
});
