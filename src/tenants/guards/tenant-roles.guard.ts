import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { TenantRole } from '@prisma/client';
import { Request } from 'express';
import { TENANT_ROLES_KEY } from '../decorators/tenant-roles.decorator';
@Injectable()
export class TenantRolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}
  canActivate(context: ExecutionContext) {
    const roles = this.reflector.getAllAndOverride<TenantRole[]>(
      TENANT_ROLES_KEY,
      [context.getHandler(), context.getClass()],
    );
    if (!roles?.length) return true;
    const role = context.switchToHttp().getRequest<Request>()
      .tenantContext?.tenantRole;
    if (!role || !roles.includes(role))
      throw new ForbiddenException('Access denied.');
    return true;
  }
}
