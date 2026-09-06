import { Injectable, Logger } from '@nestjs/common';
import { AppointmentStatus } from '@prisma/client';
import { DateTime } from 'luxon';
import { AppointmentsService } from '../appointments/appointments.service';
import { VoiceSessionService } from '../voice-session/voice-session.service';
import { VoiceCancelAppointmentDto } from './dto/voice-cancel-appointment.dto';
import { VoicePatientVerificationService } from './voice-patient-verification.service';
import { ResolvedVoiceToolSession } from './voice-tool-session.service';

interface AppointmentSummary {
  appointmentReference: string;
  date: string;
  startTime: string;
  endTime: string;
  timezone: string;
  providerName: string;
  serviceName: string;
  locationName: string;
  status?: AppointmentStatus;
}

export type VoiceCancellationResponse =
  | { status: 'verification_required'; message: string }
  | { status: 'appointment_selection_required'; message: string }
  | { status: 'appointment_not_cancellable'; message: string }
  | { status: 'cancellation_failed'; message: string }
  | {
      status: 'confirmation_required';
      message: string;
      appointment: AppointmentSummary;
    }
  | { status: 'ok'; message: string; appointment: AppointmentSummary };

@Injectable()
export class VoiceAppointmentCancellationService {
  private readonly logger = new Logger(
    VoiceAppointmentCancellationService.name,
  );

  constructor(
    private readonly appointments: AppointmentsService,
    private readonly verification: VoicePatientVerificationService,
    private readonly sessions: VoiceSessionService,
  ) {}

  async cancel(
    resolved: ResolvedVoiceToolSession,
    dto: VoiceCancelAppointmentDto,
  ): Promise<VoiceCancellationResponse> {
    const verified =
      await this.verification.getVerifiedPatientForBooking(resolved);
    if (verified.status !== 'verified')
      return {
        status: 'verification_required',
        message:
          'Patient verification is required before an appointment can be cancelled.',
      };
    const appointmentId = await this.sessions.getSelectedAppointmentId({
      token: resolved.token,
      tenantId: resolved.context.tenantId,
      channel: resolved.context.channel,
      channelIdentity: resolved.context.webVoiceChannelId,
    });
    if (!appointmentId) return selectionRequired();

    try {
      if (dto.confirmed === true) {
        const pending = await this.sessions.consumePendingCancellation({
          token: resolved.token,
          patientId: verified.patientId,
          appointmentId,
        });
        if (pending.status === 'stale') return selectionRequired();
        if (pending.status === 'consumed')
          return (
            await this.execute(
              resolved,
              verified.patientId,
              appointmentId,
              true,
              pending.appointmentUpdatedAt,
            )
          ).response;
      }

      const preview = await this.execute(
        resolved,
        verified.patientId,
        appointmentId,
        false,
      );
      if (preview.response.status !== 'confirmation_required')
        return preview.response;
      const stored = await this.sessions.setPendingCancellation({
        token: resolved.token,
        patientId: verified.patientId,
        appointmentId,
        appointmentUpdatedAt: preview.appointmentUpdatedAt!,
      });
      return stored === 'updated' ? preview.response : selectionRequired();
    } catch {
      this.logger.error('Voice appointment cancellation failed.');
      return {
        status: 'cancellation_failed',
        message: 'The appointment could not be cancelled. Please try again.',
      };
    }
  }

  private async execute(
    resolved: ResolvedVoiceToolSession,
    patientId: string,
    appointmentId: string,
    mutate: boolean,
    expectedUpdatedAt?: string,
  ): Promise<{
    response: VoiceCancellationResponse;
    appointmentUpdatedAt?: string;
  }> {
    const result = await this.appointments.cancelVerifiedPatient({
      tenantId: resolved.context.tenantId,
      patientId,
      appointmentId,
      mutate,
      expectedUpdatedAt,
    });
    if (result.status === 'selection_invalid') {
      await this.sessions.clearAppointmentSelection({
        token: resolved.token,
        patientId,
        appointmentId,
      });
      return { response: selectionRequired() };
    }
    if (result.status === 'appointment_not_cancellable')
      return {
        response: {
          status: 'appointment_not_cancellable',
          message: 'The selected appointment cannot be cancelled.',
        },
      };
    const appointment = summary(result.appointment);
    if (mutate) {
      await this.sessions.clearAppointmentSelection({
        token: resolved.token,
        patientId,
        appointmentId,
      });
      return {
        response: {
          status: 'ok',
          message: result.changed
            ? 'The appointment was cancelled successfully.'
            : 'The appointment was already cancelled.',
          appointment,
        },
      };
    }
    return {
      response: {
        status: 'confirmation_required',
        message:
          'Please confirm that this appointment should be cancelled. It has not been cancelled yet.',
        appointment,
      },
      appointmentUpdatedAt: result.appointment.updatedAt.toISOString(),
    };
  }
}

function selectionRequired(): VoiceCancellationResponse {
  return {
    status: 'appointment_selection_required',
    message: 'An appointment must be selected before it can be cancelled.',
  };
}

function summary(value: {
  appointmentNumber: string;
  startAt: Date;
  endAt: Date;
  timezone: string;
  providerName: string;
  serviceName: string;
  locationName: string;
  status: AppointmentStatus;
}): AppointmentSummary {
  const start = DateTime.fromJSDate(value.startAt).setZone(value.timezone);
  const end = DateTime.fromJSDate(value.endAt).setZone(value.timezone);
  if (!start.isValid || !end.isValid) throw new Error('Invalid timezone.');
  return {
    appointmentReference: value.appointmentNumber,
    date: start.toFormat('yyyy-LL-dd'),
    startTime: start.toFormat('HH:mm'),
    endTime: end.toFormat('HH:mm'),
    timezone: value.timezone,
    providerName: value.providerName,
    serviceName: value.serviceName,
    locationName: value.locationName,
    status: value.status,
  };
}
