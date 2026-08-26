import { TelephonyProvider } from '@prisma/client';

export interface ResolvedInboundNumberContext {
  telephonyNumberId: string;
  phoneNumber: string;
  provider: TelephonyProvider;
  providerPhoneNumberId: string | null;
  tenantId: string;
  tenantName: string;
  tenantSlug: string;
  locationId: string | null;
  locationName: string | null;
  timezone: string | null;
  escalationPhoneNumber: string | null;
}
