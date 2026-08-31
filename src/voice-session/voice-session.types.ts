import { VoiceChannel } from '../voice/context/voice-context';

export const VOICE_SESSION_TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;

export interface VoiceSessionRecord {
  stateVersion: 1;
  sessionId: string;
  tenantId: string;
  channel: VoiceChannel;
  channelIdentity: string;
  selectedLocationId: string | null;
  patientVerification?: PatientVerificationState;
  createdAt: string;
  expiresAt: string;
}

export interface PatientVerificationState {
  candidatePatientIds: string[];
  verifiedPatientId: string | null;
  failedAttempts: number;
  locked: boolean;
  identificationCompleted: boolean;
  identificationFlowVersion: number;
}
