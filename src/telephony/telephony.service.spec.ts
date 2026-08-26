import { ConflictException, NotFoundException } from '@nestjs/common';
import {
  Prisma,
  TelephonyNumberStatus,
  TelephonyProvider,
} from '@prisma/client';
import { TelephonyService } from './telephony.service';

/* Jest's intentionally dynamic Prisma boundary uses untyped callback payloads. */
/* eslint-disable @typescript-eslint/no-unsafe-return, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-assignment */

describe('TelephonyService', () => {
  const tenantId = '11111111-1111-4111-8111-111111111111';
  const locationId = '22222222-2222-4222-8222-222222222222';
  const context = { tenantId } as never;
  const input = {
    phoneNumber: '+1 305 555 1001',
    provider: TelephonyProvider.TWILIO,
  };

  it('derives tenant ownership, normalizes E.164, and permits tenant-wide scope', async () => {
    const create = jest.fn().mockImplementation(({ data }) => ({
      ...data,
      locationId: null,
      status: TelephonyNumberStatus.ACTIVE,
    }));
    const prisma = {
      location: { findFirst: jest.fn() },
      telephonyNumber: { create },
    } as never;
    const result = await new TelephonyService(prisma).create(context, input);
    expect(result).toMatchObject({
      tenantId,
      phoneNumber: '+13055551001',
      locationId: null,
      provider: TelephonyProvider.TWILIO,
      status: TelephonyNumberStatus.ACTIVE,
    });
    expect(create.mock.calls[0][0].data).not.toHaveProperty('status');
  });

  it('accepts a same-tenant location and optional provider reference', async () => {
    const findFirst = jest.fn().mockResolvedValue({ id: locationId });
    const create = jest.fn().mockImplementation(({ data }) => data);
    const service = new TelephonyService({
      location: { findFirst },
      telephonyNumber: { create },
    } as never);
    await service.create(context, {
      ...input,
      locationId,
      providerPhoneNumberId: '  PN123  ',
    });
    expect(findFirst).toHaveBeenCalledWith({
      where: { id: locationId, tenantId },
      select: { id: true },
    });
    expect(create.mock.calls[0][0].data).toMatchObject({
      tenantId,
      locationId,
      providerPhoneNumberId: 'PN123',
    });
  });

  it('rejects a cross-tenant location', async () => {
    const prisma = {
      location: { findFirst: jest.fn().mockResolvedValue(null) },
      telephonyNumber: { create: jest.fn() },
    } as never;
    await expect(
      new TelephonyService(prisma).create(context, { ...input, locationId }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('maps database uniqueness races to a safe conflict', async () => {
    const duplicate = new Prisma.PrismaClientKnownRequestError('duplicate', {
      code: 'P2002',
      clientVersion: 'test',
    });
    const prisma = {
      location: { findFirst: jest.fn() },
      telephonyNumber: { create: jest.fn().mockRejectedValue(duplicate) },
    } as never;
    await expect(
      new TelephonyService(prisma).create(context, input),
    ).rejects.toMatchObject({
      constructor: ConflictException,
      message: 'This phone number is already configured.',
    });
  });

  it('tenant-scopes list, search, filters, and pagination', async () => {
    const findMany = jest.fn().mockResolvedValue([]);
    const count = jest.fn().mockResolvedValue(0);
    const service = new TelephonyService({
      telephonyNumber: { findMany, count },
      $transaction: jest.fn((queries) => Promise.all(queries)),
    } as never);
    await service.list(context, {
      page: 2,
      limit: 5,
      search: ' PN ',
      status: TelephonyNumberStatus.INACTIVE,
      locationId,
    });
    expect(findMany.mock.calls[0][0]).toMatchObject({
      where: {
        tenantId,
        status: TelephonyNumberStatus.INACTIVE,
        locationId,
        OR: expect.any(Array),
      },
      skip: 5,
      take: 5,
    });
  });

  it('hides another tenant record and scopes status changes', async () => {
    const missing = new TelephonyService({
      telephonyNumber: { findFirst: jest.fn().mockResolvedValue(null) },
    } as never);
    await expect(missing.get(context, 'foreign')).rejects.toBeInstanceOf(
      NotFoundException,
    );

    const update = jest.fn().mockResolvedValue({});
    const service = new TelephonyService({
      telephonyNumber: {
        findFirst: jest.fn().mockResolvedValue({ id: 'own' }),
        update,
      },
    } as never);
    await service.status(context, 'own', TelephonyNumberStatus.INACTIVE);
    expect(update.mock.calls[0][0]).toMatchObject({
      where: { tenantId_id: { tenantId, id: 'own' } },
      data: { status: TelephonyNumberStatus.INACTIVE },
    });
  });
});
