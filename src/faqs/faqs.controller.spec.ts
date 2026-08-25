import { TenantRole } from '@prisma/client';
import { TENANT_ROLES_KEY } from '../tenants/decorators/tenant-roles.decorator';
import { FaqsController } from './faqs.controller';

/* Decorator metadata is intentionally read from unbound prototype methods. */
/* eslint-disable @typescript-eslint/unbound-method */

describe('FaqsController RBAC', () => {
  const read = [
    TenantRole.CLINIC_OWNER,
    TenantRole.CLINIC_ADMIN,
    TenantRole.RECEPTIONIST,
  ];
  const write = [TenantRole.CLINIC_OWNER, TenantRole.CLINIC_ADMIN];

  it.each(['list', 'get'] as const)(
    '%s is available to all tenant roles',
    (method) => {
      expect(
        Reflect.getMetadata(TENANT_ROLES_KEY, FaqsController.prototype[method]),
      ).toEqual(read);
    },
  );

  it.each(['create', 'update', 'status'] as const)(
    '%s excludes receptionists',
    (method) => {
      expect(
        Reflect.getMetadata(TENANT_ROLES_KEY, FaqsController.prototype[method]),
      ).toEqual(write);
    },
  );
});
