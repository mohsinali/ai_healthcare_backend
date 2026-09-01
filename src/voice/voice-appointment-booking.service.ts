import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ConfigurationStatus } from '@prisma/client';
import { AppointmentsService } from '../appointments/appointments.service';
import { PrismaService } from '../database/prisma.service';
import { VoiceBookAppointmentDto } from './dto/voice-book-appointment.dto';
import { VoicePatientVerificationService } from './voice-patient-verification.service';
import { ResolvedVoiceToolSession } from './voice-tool-session.service';

export type VoiceBookingStatus =
  | 'booked'
  | 'confirmation_required'
  | 'verification_required'
  | 'manual_verification_required'
  | 'location_required'
  | 'service_not_found'
  | 'provider_not_found'
  | 'provider_not_qualified'
  | 'invalid_appointment_time'
  | 'slot_unavailable'
  | 'booking_failed';

export interface VoiceBookingResponse {
  status: VoiceBookingStatus;
  message: string;
  appointment?: {
    confirmationCode: string;
    locationName: string;
    serviceName: string;
    providerName: string;
    appointmentDate: string;
    startTime: string;
    timezone: string;
  };
}

@Injectable()
export class VoiceAppointmentBookingService {
  private readonly logger = new Logger(VoiceAppointmentBookingService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly appointments: AppointmentsService,
    private readonly verification: VoicePatientVerificationService,
  ) {}

  async book(
    resolved: ResolvedVoiceToolSession,
    dto: VoiceBookAppointmentDto,
  ): Promise<VoiceBookingResponse> {
    if (dto.confirmed !== true)
      return response(
        'confirmation_required',
        'Please explicitly confirm the appointment details before booking.',
      );
    const locationId = resolved.session.selectedLocationId;
    if (!locationId)
      return response(
        'location_required',
        'Select a clinic location before booking an appointment.',
      );
    const patient =
      await this.verification.getVerifiedPatientForBooking(resolved);
    if (patient.status !== 'verified')
      return response(
        patient.status,
        patient.status === 'manual_verification_required'
          ? 'Automated patient verification cannot continue for this conversation.'
          : 'Patient verification is required before booking an appointment.',
      );

    try {
      const location = await this.prisma.location.findFirst({
        where: {
          id: locationId,
          tenantId: resolved.context.tenantId,
          status: ConfigurationStatus.ACTIVE,
        },
        select: { id: true },
      });
      if (!location)
        return response(
          'location_required',
          'Select an active clinic location before booking an appointment.',
        );
      const serviceName = dto.serviceName.trim();
      const service = await this.prisma.service.findFirst({
        where: {
          tenantId: resolved.context.tenantId,
          status: ConfigurationStatus.ACTIVE,
          durationMinutes: { gt: 0 },
          locationServices: {
            some: { tenantId: resolved.context.tenantId, locationId },
          },
          OR: [
            { name: { equals: serviceName, mode: 'insensitive' } },
            { normalizedName: normalize(serviceName) },
          ],
        },
        select: { id: true },
      });
      if (!service)
        return response(
          'service_not_found',
          'The requested service is not available at the selected location.',
        );
      const providerName = dto.providerName.trim();
      const terms = normalize(providerName)
        .split(/\s+/)
        .filter(Boolean)
        .slice(0, 12);
      const provider = await this.prisma.provider.findFirst({
        where: {
          tenantId: resolved.context.tenantId,
          status: ConfigurationStatus.ACTIVE,
          providerLocations: {
            some: { tenantId: resolved.context.tenantId, locationId },
          },
          AND: terms.map((term) => ({
            OR: [
              { firstName: { contains: term, mode: 'insensitive' as const } },
              { lastName: { contains: term, mode: 'insensitive' as const } },
              { displayName: { contains: term, mode: 'insensitive' as const } },
              { title: { contains: term, mode: 'insensitive' as const } },
            ],
          })),
        },
        select: {
          id: true,
          providerServices: {
            where: {
              tenantId: resolved.context.tenantId,
              serviceId: service.id,
            },
            select: { id: true },
          },
        },
        orderBy: [
          { lastName: 'asc' },
          { firstName: 'asc' },
          { providerNumber: 'asc' },
        ],
      });
      if (!provider)
        return response(
          'provider_not_found',
          'The requested provider was not found at the selected location.',
        );
      if (!provider.providerServices.length)
        return response(
          'provider_not_qualified',
          'The requested provider is not associated with the selected service.',
        );

      const booked = await this.appointments.bookVerifiedPatient({
        tenantId: resolved.context.tenantId,
        patientId: patient.patientId,
        locationId,
        serviceId: service.id,
        providerId: provider.id,
        appointmentDate: dto.appointmentDate,
        startTime: dto.startTime,
      });
      return {
        status: 'booked',
        message: 'Your appointment has been booked successfully.',
        appointment: {
          confirmationCode: booked.appointmentNumber,
          locationName: booked.locationName,
          serviceName: booked.serviceName,
          providerName: booked.providerName,
          appointmentDate: dto.appointmentDate,
          startTime: dto.startTime,
          timezone: booked.timezone,
        },
      };
    } catch (error: unknown) {
      if (error instanceof ConflictException)
        return response(
          'slot_unavailable',
          'That appointment time is no longer available. Please search again.',
        );
      if (
        error instanceof BadRequestException ||
        error instanceof NotFoundException
      )
        return response(
          'invalid_appointment_time',
          'The requested appointment date or time is not valid.',
        );
      this.logger.error('Voice appointment booking failed.');
      return response(
        'booking_failed',
        'The appointment could not be booked. Please try again.',
      );
    }
  }
}

function response(
  status: Exclude<VoiceBookingStatus, 'booked'>,
  message: string,
): VoiceBookingResponse {
  return { status, message };
}

function normalize(value: string) {
  return value
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();
}
