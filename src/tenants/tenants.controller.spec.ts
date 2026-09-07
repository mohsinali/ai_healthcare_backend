import { PlatformRole } from '@prisma/client';
import { PLATFORM_ROLES_KEY } from '../auth/decorators/platform-roles.decorator';
import { TenantsController } from './tenants.controller';

/* Controller methods are inspected as metadata targets and are never invoked. */
/* eslint-disable @typescript-eslint/unbound-method */

describe('TenantsController authorization', () => {
  it('reserves creation, readiness, and repair for Super Admins', () => {
    expect(Reflect.getMetadata(PLATFORM_ROLES_KEY, TenantsController)).toEqual([
      PlatformRole.SUPER_ADMIN,
    ]);
    expect(TenantsController.prototype.create).toBeDefined();
    expect(TenantsController.prototype.get).toBeDefined();
    expect(TenantsController.prototype.repairProvisioning).toBeDefined();
    expect(TenantsController.prototype.addMember).toBeDefined();
    expect(TenantsController.prototype.confirmExistingMember).toBeDefined();
  });
});
