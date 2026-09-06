import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { AppointmentStatus } from '@prisma/client';
import { DateTime } from 'luxon';
import { AppointmentsService } from '../appointments/appointments.service';
import { VoiceSessionService } from '../voice-session/voice-session.service';
import { VoiceRescheduleAppointmentDto } from './dto/voice-reschedule-appointment.dto';
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

export type VoiceRescheduleResponse =
  | { status: 'verification_required'; message: string }
  | { status: 'appointment_selection_required'; message: string }
  | { status: 'appointment_not_reschedulable'; message: string }
  | { status: 'slot_unavailable'; message: string }
  | { status: 'invalid_appointment_time'; message: string }
  | { status: 'reschedule_failed'; message: string }
  | {
      status: 'confirmation_required';
      message: string;
      currentAppointment: AppointmentSummary;
      proposedAppointment: Omit<
        AppointmentSummary,
        'appointmentReference' | 'status'
      >;
    }
  | { status: 'ok'; message: string; appointment: AppointmentSummary };

@Injectable()
export class VoiceAppointmentReschedulingService {
  private readonly logger = new Logger(
    VoiceAppointmentReschedulingService.name,
  );

  constructor(
    private readonly appointments: AppointmentsService,
    private readonly verification: VoicePatientVerificationService,
    private readonly sessions: VoiceSessionService,
  ) {}

  async reschedule(
    resolved: ResolvedVoiceToolSession,
    dto: VoiceRescheduleAppointmentDto,
  ): Promise<VoiceRescheduleResponse> {
    const verified =
      await this.verification.getVerifiedPatientForBooking(resolved);
    if (verified.status !== 'verified')
      return {
        status: 'verification_required',
        message:
          'Patient verification is required before an appointment can be rescheduled.',
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
        const consumed = await this.sessions.consumePendingReschedule({
          token: resolved.token,
          patientId: verified.patientId,
          appointmentId,
          appointmentDate: dto.appointmentDate,
          startTime: dto.startTime,
        });
        if (consumed === 'stale') return selectionRequired();
        if (consumed === 'consumed')
          return this.execute(
            resolved,
            verified.patientId,
            appointmentId,
            dto,
            true,
          );
      }

      const preview = await this.execute(
        resolved,
        verified.patientId,
        appointmentId,
        dto,
        false,
      );
      if (preview.status !== 'confirmation_required') return preview;
      const stored = await this.sessions.setPendingReschedule({
        token: resolved.token,
        patientId: verified.patientId,
        appointmentId,
        appointmentDate: dto.appointmentDate,
        startTime: dto.startTime,
      });
      return stored === 'updated' ? preview : selectionRequired();
    } catch (error: unknown) {
      if (error instanceof ConflictException)
        return {
          status: 'slot_unavailable',
          message:
            'That appointment time is no longer available. Please search again.',
        };
      if (
        error instanceof BadRequestException ||
        error instanceof NotFoundException
      )
        return {
          status: 'invalid_appointment_time',
          message: 'The requested appointment date or time is not valid.',
        };
      this.logger.error('Voice appointment rescheduling failed.');
      return {
        status: 'reschedule_failed',
        message: 'The appointment could not be rescheduled. Please try again.',
      };
    }
  }

  private async execute(
    resolved: ResolvedVoiceToolSession,
    patientId: string,
    appointmentId: string,
    dto: VoiceRescheduleAppointmentDto,
    mutate: boolean,
  ): Promise<VoiceRescheduleResponse> {
    const result = await this.appointments.rescheduleVerifiedPatient({
      tenantId: resolved.context.tenantId,
      patientId,
      appointmentId,
      appointmentDate: dto.appointmentDate,
      startTime: dto.startTime,
      mutate,
    });
    if (result.status === 'selection_invalid') {
      await this.sessions.clearAppointmentSelection({
        token: resolved.token,
        patientId,
        appointmentId,
      });
      return selectionRequired();
    }
    if (result.status === 'appointment_not_reschedulable')
      return {
        status: 'appointment_not_reschedulable',
        message: 'The selected appointment cannot be rescheduled.',
      };
    const proposed = summary(result.appointment, result.appointment);
    if (mutate)
      return {
        status: 'ok',
        message: result.changed
          ? 'The appointment was rescheduled successfully.'
          : 'The appointment is already scheduled for that time.',
        appointment: proposed,
      };
    return {
      status: 'confirmation_required',
      message: 'Please confirm the proposed appointment change.',
      currentAppointment: summary(result.appointment, result.current),
      proposedAppointment: {
        date: proposed.date,
        startTime: proposed.startTime,
        endTime: proposed.endTime,
        timezone: proposed.timezone,
        providerName: proposed.providerName,
        serviceName: proposed.serviceName,
        locationName: proposed.locationName,
      },
    };
  }
}

function selectionRequired(): VoiceRescheduleResponse {
  return {
    status: 'appointment_selection_required',
    message: 'An appointment must be selected before it can be rescheduled.',
  };
}

function summary(
  details: {
    appointmentNumber: string;
    timezone: string;
    providerName: string;
    serviceName: string;
    locationName: string;
    status: AppointmentStatus;
  },
  interval: { startAt: Date; endAt: Date },
): AppointmentSummary {
  const start = DateTime.fromJSDate(interval.startAt).setZone(details.timezone);
  const end = DateTime.fromJSDate(interval.endAt).setZone(details.timezone);
  if (!start.isValid || !end.isValid) throw new Error('Invalid timezone.');
  return {
    appointmentReference: details.appointmentNumber,
    date: start.toFormat('yyyy-LL-dd'),
    startTime: start.toFormat('HH:mm'),
    endTime: end.toFormat('HH:mm'),
    timezone: details.timezone,
    providerName: details.providerName,
    serviceName: details.serviceName,
    locationName: details.locationName,
    status: details.status,
  };
}
