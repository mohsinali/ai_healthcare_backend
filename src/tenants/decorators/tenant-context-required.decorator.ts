import { SetMetadata } from '@nestjs/common';
export const TENANT_CONTEXT_REQUIRED_KEY = 'tenant-context-required';
export const TenantContextRequired = () =>
  SetMetadata(TENANT_CONTEXT_REQUIRED_KEY, true);
