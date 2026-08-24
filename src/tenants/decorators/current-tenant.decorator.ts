import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { Request } from 'express';
export const CurrentTenant = createParamDecorator(
  (_data: unknown, context: ExecutionContext) =>
    context.switchToHttp().getRequest<Request>().tenantContext,
);
