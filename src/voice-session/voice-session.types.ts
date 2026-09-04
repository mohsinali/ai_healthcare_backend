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
  appointmentSelection?: AppointmentSelectionState;
  pendingReschedule?: PendingRescheduleState;
  createdAt: string;
  expiresAt: string;
}

export interface PendingRescheduleState {
  appointmentDate: string;
  startTime: string;
  patientVerificationFlowVersion: number;
  appointmentSelectionVersion: number;
}

export interface AppointmentSelectionState {
  selectedAppointmentId: string | null;
  patientVerificationFlowVersion: number;
  selectionVersion: number;
}

export interface PatientVerificationState {
  candidatePatientIds: string[];
  verifiedPatientId: string | null;
  failedAttempts: number;
  locked: boolean;
  identificationCompleted: boolean;
  identificationFlowVersion: number;
}
