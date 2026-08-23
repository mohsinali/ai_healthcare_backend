import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PlatformRole } from '@prisma/client';
import { Request } from 'express';
import { PLATFORM_ROLES_KEY } from '../decorators/platform-roles.decorator';
@Injectable()
export class PlatformRolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}
  canActivate(context: ExecutionContext): boolean {
    const roles = this.reflector.getAllAndOverride<PlatformRole[]>(
      PLATFORM_ROLES_KEY,
      [context.getHandler(), context.getClass()],
    );
    if (!roles?.length) return true;
    const role = context.switchToHttp().getRequest<Request>()
      .user?.platformRole;
    if (!role || !roles.includes(role))
      throw new ForbiddenException('Access denied.');
    return true;
  }
}
