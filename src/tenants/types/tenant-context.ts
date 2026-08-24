import { TenantRole } from '@prisma/client';
export interface TrustedTenantContext {
  tenantId: string;
  tenantSlug: string;
  tenantRole: TenantRole;
  membershipId: string;
}
