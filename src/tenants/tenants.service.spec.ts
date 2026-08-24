import { UnprocessableEntityException } from '@nestjs/common';
import { MembershipStatus, TenantRole } from '@prisma/client';
import { PrismaService } from '../database/prisma.service';
import { TenantsService } from './tenants.service';
describe('TenantsService', () => {
  const prisma = {
    tenant: { findUnique: jest.fn() },
    tenantMembership: {
      findFirst: jest.fn(),
      count: jest.fn(),
      update: jest.fn(),
    },
  } as unknown as PrismaService;
  beforeEach(() => jest.clearAllMocks());
  it('prevents deactivating the final active Clinic Owner', async () => {
    (prisma.tenantMembership.findFirst as jest.Mock).mockResolvedValue({
      id: 'member',
      tenantId: 'tenant',
      role: TenantRole.CLINIC_OWNER,
      status: MembershipStatus.ACTIVE,
    });
    (prisma.tenantMembership.count as jest.Mock).mockResolvedValue(0);
    await expect(
      new TenantsService(prisma).updateMember('tenant', 'member', {
        status: MembershipStatus.SUSPENDED,
      }),
    ).rejects.toThrow(UnprocessableEntityException);
    // eslint-disable-next-line @typescript-eslint/unbound-method
    expect(prisma.tenantMembership.update).not.toHaveBeenCalled();
  });
  it('allows owner changes when another active owner remains', async () => {
    (prisma.tenantMembership.findFirst as jest.Mock).mockResolvedValue({
      id: 'member',
      tenantId: 'tenant',
      role: TenantRole.CLINIC_OWNER,
      status: MembershipStatus.ACTIVE,
    });
    (prisma.tenantMembership.count as jest.Mock).mockResolvedValue(1);
    (prisma.tenantMembership.update as jest.Mock).mockResolvedValue({
      id: 'member',
      role: TenantRole.CLINIC_ADMIN,
    });
    await expect(
      new TenantsService(prisma).updateMember('tenant', 'member', {
        role: TenantRole.CLINIC_ADMIN,
      }),
    ).resolves.toMatchObject({ role: TenantRole.CLINIC_ADMIN });
  });
});
