import { AuthenticatedUser } from './authenticated-user';
import { TrustedTenantContext } from '../../tenants/types/tenant-context';
declare global {
  namespace Express {
    interface Request {
      user?: AuthenticatedUser;
      tenantContext?: TrustedTenantContext;
    }
  }
}
export {};
