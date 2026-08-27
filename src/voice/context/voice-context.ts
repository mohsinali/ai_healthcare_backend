import { TelephonyProvider } from '@prisma/client';

export enum VoiceChannel {
  WEB_WIDGET = 'WEB_WIDGET',
  PHONE = 'PHONE',
}

/** Trusted server-side routing context. Never construct this from tenant IDs in a request. */
interface BaseVoiceContext {
  channel: VoiceChannel;
  tenantId: string;
  tenantName: string;
  locationId: string | null;
  locationName: string | null;
  timezone: string | null;
  escalationPhoneNumber: string | null;
}

export interface PhoneVoiceContext extends BaseVoiceContext {
  channel: VoiceChannel.PHONE;
  telephonyNumberId: string;
  calledNumber: string;
  provider: TelephonyProvider;
}

export interface WebWidgetVoiceContext extends BaseVoiceContext {
  channel: VoiceChannel.WEB_WIDGET;
  webVoiceChannelId: string;
  agentId: string | null;
}

export type VoiceContext = PhoneVoiceContext | WebWidgetVoiceContext;

export interface VoiceBootstrapResponse {
  context: {
    tenantId: string;
    tenantName: string;
    locationId: string | null;
    locationName: string | null;
    timezone: string | null;
    channel: VoiceChannel.PHONE;
  };
  calledNumber: string;
}
