import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { TenantContextGuard } from './tenant-context.guard';
import { PrismaService } from '../../database/prisma.service';
describe('TenantContextGuard', () => {
  const reflector = { getAllAndOverride: jest.fn() } as unknown as Reflector;
  const prisma = {
    tenantMembership: { findFirst: jest.fn() },
  } as unknown as PrismaService;
  const request = {
    headers: { 'x-tenant-id': 'tenant-a' },
    user: { userId: 'user-a' },
  };
  const context = {
    getHandler: jest.fn(),
    getClass: jest.fn(),
    switchToHttp: () => ({ getRequest: () => request }),
  } as unknown as ExecutionContext;
  beforeEach(() => {
    jest.clearAllMocks();
    (reflector.getAllAndOverride as jest.Mock).mockReturnValue(true);
    delete (request as { tenantContext?: unknown }).tenantContext;
  });
  it('constructs context only from an active database membership', async () => {
    (prisma.tenantMembership.findFirst as jest.Mock).mockResolvedValue({
      id: 'membership-a',
      role: 'CLINIC_ADMIN',
      tenant: { id: 'tenant-a', slug: 'clinic-a' },
    });
    await expect(
      new TenantContextGuard(reflector, prisma).canActivate(context),
    ).resolves.toBe(true);
    expect(request).toHaveProperty('tenantContext', {
      tenantId: 'tenant-a',
      tenantSlug: 'clinic-a',
      tenantRole: 'CLINIC_ADMIN',
      membershipId: 'membership-a',
    });
    // Prisma's generated delegate methods are safe to inspect as Jest mocks here.
    // eslint-disable-next-line @typescript-eslint/unbound-method
    expect(prisma.tenantMembership.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
        where: expect.objectContaining({
          tenantId: 'tenant-a',
          userId: 'user-a',
          status: 'ACTIVE',
          tenant: { status: 'ACTIVE' },
        }),
      }),
    );
  });
  it('rejects an unrelated, suspended, or disabled tenant selection without disclosure', async () => {
    (prisma.tenantMembership.findFirst as jest.Mock).mockResolvedValue(null);
    await expect(
      new TenantContextGuard(reflector, prisma).canActivate(context),
    ).rejects.toThrow(ForbiddenException);
  });
});
