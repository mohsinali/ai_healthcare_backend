import { TenantRole } from '@prisma/client';
import { TENANT_ROLES_KEY } from '../tenants/decorators/tenant-roles.decorator';
import { SettingsController } from './settings.controller';

describe('SettingsController authorization metadata', () => {
  it('allows all active tenant roles to read', () => {
    const roles = Reflect.getMetadata(
      TENANT_ROLES_KEY,
      // eslint-disable-next-line @typescript-eslint/unbound-method
      SettingsController.prototype.get,
    ) as TenantRole[];
    expect(roles).toEqual([
      TenantRole.CLINIC_OWNER,
      TenantRole.CLINIC_ADMIN,
      TenantRole.RECEPTIONIST,
    ]);
  });

  it('allows only Clinic Owners to update', () => {
    const roles = Reflect.getMetadata(
      TENANT_ROLES_KEY,
      // eslint-disable-next-line @typescript-eslint/unbound-method
      SettingsController.prototype.update,
    ) as TenantRole[];
    expect(roles).toEqual([TenantRole.CLINIC_OWNER]);
  });
});
