import { UnprocessableEntityException } from '@nestjs/common';
import { MembershipStatus, TenantRole } from '@prisma/client';
import { PrismaService } from '../database/prisma.service';
import { TenantsService } from './tenants.service';
import { TenantProvisioningService } from './tenant-provisioning.service';

/* Prisma transaction callbacks are intentionally represented by Jest mocks. */
/* eslint-disable @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-return, @typescript-eslint/unbound-method, @typescript-eslint/require-await */
describe('TenantsService', () => {
  const prisma = {
    tenant: { findUnique: jest.fn() },
    tenantMembership: {
      findFirst: jest.fn(),
      count: jest.fn(),
      update: jest.fn(),
    },
  } as unknown as PrismaService;
  const provisioning = {
    ensure: jest.fn(),
    status: jest.fn(),
  } as unknown as TenantProvisioningService;
  beforeEach(() => jest.clearAllMocks());
  it('creates and provisions a tenant in one transaction', async () => {
    const tx = {
      tenant: {
        create: jest.fn().mockResolvedValue({
          id: 'tenant-id',
          name: 'Clinic',
          slug: 'clinic',
        }),
      },
    };
    const transactionalPrisma = {
      $transaction: jest.fn((callback) => callback(tx)),
    } as unknown as PrismaService;
    (provisioning.ensure as jest.Mock).mockResolvedValue({
      baselineComplete: true,
      webVoiceChannelId: 'channel-id',
      webVoiceChannelStatus: 'INACTIVE',
    });

    const result = await new TenantsService(
      transactionalPrisma,
      provisioning,
    ).create({ name: ' Clinic ', slug: 'clinic' });

    expect(tx.tenant.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: { name: 'Clinic', slug: 'clinic' } }),
    );
    expect(provisioning.ensure).toHaveBeenCalledWith('tenant-id', tx);
    expect(result).toMatchObject({
      id: 'tenant-id',
      provisioning: { webVoiceChannelStatus: 'INACTIVE' },
    });
    expect(result).not.toHaveProperty('publicWidgetKey');
    expect(result).not.toHaveProperty('agentId');
  });

  it('does not report success when required provisioning fails', async () => {
    const tx = {
      tenant: { create: jest.fn().mockResolvedValue({ id: 'tenant-id' }) },
    };
    const transactionalPrisma = {
      $transaction: jest.fn(async (callback) => callback(tx)),
    } as unknown as PrismaService;
    (provisioning.ensure as jest.Mock).mockRejectedValue(
      new Error('database failure'),
    );

    await expect(
      new TenantsService(transactionalPrisma, provisioning).create({
        name: 'Clinic',
        slug: 'clinic',
      }),
    ).rejects.toThrow('database failure');
  });
  it('prevents deactivating the final active Clinic Owner', async () => {
    (prisma.tenantMembership.findFirst as jest.Mock).mockResolvedValue({
      id: 'member',
      tenantId: 'tenant',
      role: TenantRole.CLINIC_OWNER,
      status: MembershipStatus.ACTIVE,
    });
    (prisma.tenantMembership.count as jest.Mock).mockResolvedValue(0);
    await expect(
      new TenantsService(prisma, provisioning).updateMember(
        'tenant',
        'member',
        {
          status: MembershipStatus.SUSPENDED,
        },
      ),
    ).rejects.toThrow(UnprocessableEntityException);
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
      new TenantsService(prisma, provisioning).updateMember(
        'tenant',
        'member',
        {
          role: TenantRole.CLINIC_ADMIN,
        },
      ),
    ).resolves.toMatchObject({ role: TenantRole.CLINIC_ADMIN });
  });
});
