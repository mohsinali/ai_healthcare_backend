import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { TenantRolesGuard } from './tenant-roles.guard';
describe('TenantRolesGuard', () => {
  it('uses the trusted context role and ignores request-supplied roles', () => {
    const reflector = {
      getAllAndOverride: () => ['CLINIC_OWNER', 'CLINIC_ADMIN'],
    } as unknown as Reflector;
    const context = {
      getHandler: jest.fn(),
      getClass: jest.fn(),
      switchToHttp: () => ({
        getRequest: () => ({
          body: { role: 'CLINIC_OWNER' },
          tenantContext: { tenantRole: 'RECEPTIONIST' },
        }),
      }),
    } as unknown as ExecutionContext;
    expect(() => new TenantRolesGuard(reflector).canActivate(context)).toThrow(
      ForbiddenException,
    );
  });
});
