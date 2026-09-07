import { BadRequestException, ConflictException } from '@nestjs/common';
import { TenantRole } from '@prisma/client';
import { AuthService } from '../auth/auth.service';
import { PrismaService } from '../database/prisma.service';
import { TenantProvisioningService } from './tenant-provisioning.service';
import { TenantsService } from './tenants.service';

/* Prisma delegates are Jest mocks inspected as functions in these tests. */
/* eslint-disable @typescript-eslint/unbound-method */

describe('Super Admin member management', () => {
  const tenantId = 'tenant-a';
  const role = TenantRole.CLINIC_ADMIN;
  const tx = {
    user: { create: jest.fn() },
    tenantMembership: { create: jest.fn() },
  };
  const prisma = {
    tenant: { findUnique: jest.fn() },
    user: { findUnique: jest.fn() },
    tenantMembership: { findUnique: jest.fn(), create: jest.fn() },
    $transaction: jest.fn((callback: (client: typeof tx) => unknown) =>
      callback(tx),
    ),
  } as unknown as PrismaService;
  const auth = { hashPassword: jest.fn() } as unknown as AuthService;
  const service = new TenantsService(
    prisma,
    {} as TenantProvisioningService,
    auth,
  );

  beforeEach(() => {
    jest.clearAllMocks();
    (prisma.tenant.findUnique as jest.Mock).mockResolvedValue({ id: tenantId });
  });

  it('normalizes exact email and atomically creates a user and selected-tenant membership', async () => {
    (prisma.user.findUnique as jest.Mock).mockResolvedValue(null);
    (auth.hashPassword as jest.Mock).mockResolvedValue('argon-hash');
    tx.user.create.mockResolvedValue({ id: 'new-user' });
    tx.tenantMembership.create.mockResolvedValue({ id: 'membership' });

    const result = await service.addMember(tenantId, {
      email: '  NEW@Example.COM ',
      firstName: ' New ',
      lastName: ' Person ',
      temporaryPassword: 'long-enough-password',
      role,
    });

    expect(prisma.user.findUnique).toHaveBeenCalledWith({
      where: { email: 'new@example.com' },
      select: { id: true },
    });
    expect(auth.hashPassword).toHaveBeenCalledWith('long-enough-password');
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(tx.user.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: {
          email: 'new@example.com',
          firstName: 'New',
          lastName: 'Person',
          passwordHash: 'argon-hash',
        },
      }),
    );
    expect(tx.tenantMembership.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: { tenantId, userId: 'new-user', role },
      }),
    );
    expect(result).toEqual({
      state: 'created',
      member: { id: 'membership' },
    });
    expect(JSON.stringify(result)).not.toContain('password');
  });

  it('requires new-account names and a temporary password', async () => {
    (prisma.user.findUnique as jest.Mock).mockResolvedValue(null);
    await expect(
      service.addMember(tenantId, { email: 'new@example.com', role }),
    ).rejects.toThrow(BadRequestException);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('returns only a neutral confirmation state for an existing exact email', async () => {
    (prisma.user.findUnique as jest.Mock).mockResolvedValue({ id: 'existing' });
    (prisma.tenantMembership.findUnique as jest.Mock).mockResolvedValue(null);

    const result = await service.addMember(tenantId, {
      email: 'EXISTING@example.com',
      firstName: 'Must not be used',
      lastName: 'Must not be used',
      temporaryPassword: 'must-not-be-hashed',
      role,
    });

    expect(result).toEqual(
      expect.objectContaining({ state: 'confirmation_required' }),
    );
    expect(result).not.toHaveProperty('user');
    expect(auth.hashPassword).not.toHaveBeenCalled();
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('rejects an account that already belongs to the selected tenant', async () => {
    (prisma.user.findUnique as jest.Mock).mockResolvedValue({ id: 'existing' });
    (prisma.tenantMembership.findUnique as jest.Mock).mockResolvedValue({
      id: 'membership',
    });
    await expect(
      service.addMember(tenantId, { email: 'existing@example.com', role }),
    ).rejects.toThrow(ConflictException);
  });

  it('confirmation re-resolves email and creates only the selected membership', async () => {
    (prisma.user.findUnique as jest.Mock).mockResolvedValue({ id: 'existing' });
    (prisma.tenantMembership.create as jest.Mock).mockResolvedValue({
      id: 'membership',
    });
    await expect(
      service.confirmExistingMember(tenantId, {
        email: ' Existing@Example.com ',
        role,
      }),
    ).resolves.toEqual({ id: 'membership' });
    expect(prisma.tenantMembership.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: { tenantId, userId: 'existing', role },
      }),
    );
    expect(tx.user.create).not.toHaveBeenCalled();
    expect(auth.hashPassword).not.toHaveBeenCalled();
  });
});
