import {
  BadRequestException,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Request } from 'express';
import { PrismaService } from '../../database/prisma.service';
import { TENANT_CONTEXT_REQUIRED_KEY } from '../decorators/tenant-context-required.decorator';
import { TENANT_ROLES_KEY } from '../decorators/tenant-roles.decorator';
@Injectable()
export class TenantContextGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly prisma: PrismaService,
  ) {}
  async canActivate(context: ExecutionContext) {
    const targets = [context.getHandler(), context.getClass()];
    const required =
      this.reflector.getAllAndOverride<boolean>(
        TENANT_CONTEXT_REQUIRED_KEY,
        targets,
      ) || Boolean(this.reflector.getAllAndOverride(TENANT_ROLES_KEY, targets));
    if (!required) return true;
    const request = context.switchToHttp().getRequest<Request>();
    const value = request.headers['x-tenant-id'];
    const tenantId = Array.isArray(value) ? value[0] : value;
    if (!tenantId) throw new BadRequestException('No clinic selected.');
    const membership = await this.prisma.tenantMembership.findFirst({
      where: {
        tenantId,
        userId: request.user!.userId,
        status: 'ACTIVE',
        tenant: { status: 'ACTIVE' },
      },
      select: {
        id: true,
        role: true,
        tenant: { select: { id: true, slug: true } },
      },
    });
    if (!membership) throw new ForbiddenException('Clinic access unavailable.');
    request.tenantContext = {
      tenantId: membership.tenant.id,
      tenantSlug: membership.tenant.slug,
      tenantRole: membership.role,
      membershipId: membership.id,
    };
    return true;
  }
}
