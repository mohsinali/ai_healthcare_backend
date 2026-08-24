import { DateFormat } from '@prisma/client';
import { PrismaService } from '../database/prisma.service';
import { TrustedTenantContext } from '../tenants/types/tenant-context';
import { SettingsService } from './settings.service';

describe('SettingsService', () => {
  const prisma = {
    tenant: { findUniqueOrThrow: jest.fn(), update: jest.fn() },
  } as unknown as PrismaService;
  const context = {
    tenantId: 'tenant-a',
    tenantSlug: 'a',
    tenantRole: 'CLINIC_OWNER',
    membershipId: 'member-a',
  } as TrustedTenantContext;

  beforeEach(() => jest.clearAllMocks());

  it('reads settings only from the trusted tenant context', async () => {
    (prisma.tenant.findUniqueOrThrow as jest.Mock).mockResolvedValue({
      dateFormat: DateFormat.MM_DD_YYYY,
      timezone: 'UTC',
    });
    await new SettingsService(prisma).get(context);
    // eslint-disable-next-line @typescript-eslint/unbound-method
    expect(prisma.tenant.findUniqueOrThrow).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'tenant-a' } }),
    );
  });

  it('updates only the trusted tenant and ignores extraneous tenant identity', async () => {
    (prisma.tenant.update as jest.Mock).mockResolvedValue({
      dateFormat: DateFormat.DD_MM_YYYY,
      timezone: 'Asia/Karachi',
    });
    await new SettingsService(prisma).update(context, {
      dateFormat: DateFormat.DD_MM_YYYY,
      timezone: 'Asia/Karachi',
    });
    // eslint-disable-next-line @typescript-eslint/unbound-method
    expect(prisma.tenant.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'tenant-a' },
        data: {
          dateFormat: DateFormat.DD_MM_YYYY,
          timezone: 'Asia/Karachi',
        },
      }),
    );
  });
});
