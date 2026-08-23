import { PlatformRole } from '@prisma/client';
export interface AuthenticatedUser {
  userId: string;
  email: string;
  platformRole: PlatformRole | null;
}
export interface AccessClaims {
  sub: string;
  email: string;
  platformRole: PlatformRole | null;
  type: 'access';
}
export interface RefreshClaims {
  sub: string;
  sid: string;
  type: 'refresh';
}
