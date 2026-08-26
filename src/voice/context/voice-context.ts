import { TelephonyProvider } from '@prisma/client';

/** Trusted server-side routing context. Never construct this from tenant IDs in a request. */
export interface VoiceContext {
  telephonyNumberId: string;
  calledNumber: string;
  provider: TelephonyProvider;
  tenantId: string;
  tenantName: string;
  locationId: string | null;
  locationName: string | null;
  timezone: string | null;
  escalationPhoneNumber: string | null;
}

export interface VoiceBootstrapResponse {
  context: {
    tenantId: string;
    tenantName: string;
    locationId: string | null;
    locationName: string | null;
    timezone: string | null;
  };
  calledNumber: string;
}
