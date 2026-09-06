import { TenantRole } from '@prisma/client';
import { TENANT_ROLES_KEY } from '../tenants/decorators/tenant-roles.decorator';
import { ProvidersController } from './clinic-config.controller';

describe('ProvidersController schedule authorization', () => {
  it('uses the existing provider read roles for schedule reads', () => {
    expect(
      Reflect.getMetadata(
        TENANT_ROLES_KEY,
        // eslint-disable-next-line @typescript-eslint/unbound-method
        ProvidersController.prototype.workingPeriods,
      ),
    ).toEqual([
      TenantRole.CLINIC_OWNER,
      TenantRole.CLINIC_ADMIN,
      TenantRole.RECEPTIONIST,
    ]);
  });

  it('uses the existing provider write roles for schedule replacement', () => {
    expect(
      Reflect.getMetadata(
        TENANT_ROLES_KEY,
        // eslint-disable-next-line @typescript-eslint/unbound-method
        ProvidersController.prototype.replaceWorkingPeriods,
      ),
    ).toEqual([TenantRole.CLINIC_OWNER, TenantRole.CLINIC_ADMIN]);
  });
});
