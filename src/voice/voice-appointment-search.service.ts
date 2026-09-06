import {
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { AppointmentStatus } from '@prisma/client';
import { DateTime } from 'luxon';
import { FieldValidationException } from '../common/validation/field-validation.exception';
import { PrismaService } from '../database/prisma.service';
import {
  normalizeAppointmentReference,
  storedAppointmentReference,
} from '../appointments/appointment-reference';
import { VoiceSessionService } from '../voice-session/voice-session.service';
import { VoiceAppointmentSearchDto } from './dto/voice-appointment-search.dto';
import { VoicePatientVerificationService } from './voice-patient-verification.service';
import { ResolvedVoiceToolSession } from './voice-tool-session.service';

const RESULT_LIMIT = 5;
const ELIGIBLE_STATUSES: AppointmentStatus[] = [
  AppointmentStatus.BOOKED,
  AppointmentStatus.CONFIRMED,
];

export interface VoiceAppointmentDetails {
  appointmentReference: string;
  date: string;
  startTime: string;
  endTime: string;
  timezone: string;
  providerName: string;
  serviceName: string;
  locationName: string;
  status: AppointmentStatus;
}

export type VoiceAppointmentSearchResponse =
  | { status: 'verification_required'; message: string }
  | { status: 'not_found'; message: string }
  | { status: 'ok'; appointment: VoiceAppointmentDetails }
  | {
      status: 'multiple_matches';
      message: string;
      appointments: VoiceAppointmentDetails[];
      hasMore: boolean;
    };

@Injectable()
export class VoiceAppointmentSearchService {
  private readonly logger = new Logger(VoiceAppointmentSearchService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly verification: VoicePatientVerificationService,
    private readonly sessions: VoiceSessionService,
  ) {}

  async search(
    resolved: ResolvedVoiceToolSession,
    dto: VoiceAppointmentSearchDto,
    now = new Date(),
  ): Promise<VoiceAppointmentSearchResponse> {
    const normalizedReference = dto.appointmentReference
      ? normalizeAppointmentReference(dto.appointmentReference)
      : null;
    // A reference is a complete lookup criterion. Optional filters are ignored
    // so unrelated model-supplied values cannot suppress a valid reference.
    if (!normalizedReference) this.validateDates(dto);
    const verified =
      await this.verification.getVerifiedPatientForBooking(resolved);
    if (verified.status !== 'verified')
      return {
        status: 'verification_required',
        message:
          'Patient verification is required before appointment information can be accessed.',
      };

    const flowVersion = this.sessions.patientVerification(
      await this.sessions.resolve(resolved.token),
    ).identificationFlowVersion;
    try {
      const providerTerms = normalizedReference ? [] : terms(dto.providerName);
      const localDateScope =
        !normalizedReference && dto.startDate
          ? await this.localDateScope(
              resolved.context.tenantId,
              dto.startDate,
              dto.endDate ?? dto.startDate,
            )
          : undefined;
      const appointments = await this.prisma.appointment.findMany({
        where: {
          tenantId: resolved.context.tenantId,
          patientId: verified.patientId,
          status: { in: ELIGIBLE_STATUSES },
          startAt: { gte: now },
          ...(localDateScope ? { OR: localDateScope } : {}),
          ...(normalizedReference
            ? {
                appointmentNumber: {
                  equals: storedAppointmentReference(normalizedReference),
                  mode: 'insensitive' as const,
                },
              }
            : {}),
          ...(!normalizedReference && dto.locationName
            ? {
                location: {
                  name: { equals: dto.locationName, mode: 'insensitive' },
                },
              }
            : {}),
          ...(providerTerms.length
            ? {
                provider: {
                  AND: providerTerms.map((term) => ({
                    OR: [
                      { firstName: { contains: term, mode: 'insensitive' } },
                      { lastName: { contains: term, mode: 'insensitive' } },
                      { displayName: { contains: term, mode: 'insensitive' } },
                      { title: { contains: term, mode: 'insensitive' } },
                    ],
                  })),
                },
              }
            : {}),
        },
        select: {
          id: true,
          appointmentNumber: true,
          startAt: true,
          endAt: true,
          status: true,
          location: { select: { name: true, timezone: true } },
          provider: {
            select: {
              firstName: true,
              lastName: true,
              displayName: true,
              title: true,
            },
          },
          service: { select: { name: true } },
        },
        orderBy: [{ startAt: 'asc' }, { id: 'asc' }],
        take: RESULT_LIMIT + 1,
      });
      const matches = normalizedReference
        ? appointments.filter(
            (item) =>
              normalizeAppointmentReference(item.appointmentNumber) ===
              normalizedReference,
          )
        : appointments.filter((item) =>
            this.matchesLocalDates(item.startAt, item.location.timezone, dto),
          );
      const selectedId = matches.length === 1 ? matches[0].id : null;
      const update = await this.sessions.setAppointmentSelection(
        resolved.token,
        flowVersion,
        verified.patientId,
        selectedId,
      );
      if (update === 'stale')
        return {
          status: 'verification_required',
          message:
            'Patient verification is required before appointment information can be accessed.',
        };
      if (!matches.length)
        return {
          status: 'not_found',
          message: 'No matching upcoming appointment was found.',
        };
      const visible = matches.slice(0, RESULT_LIMIT).map(formatAppointment);
      if (matches.length === 1)
        return { status: 'ok', appointment: visible[0] };
      return {
        status: 'multiple_matches',
        message:
          'Multiple upcoming appointments were found. Ask the patient which appointment they mean.',
        appointments: visible,
        hasMore: matches.length > RESULT_LIMIT,
      };
    } catch (error) {
      if (error instanceof FieldValidationException) throw error;
      this.logger.error('Voice appointment search failed.');
      throw new ServiceUnavailableException(
        'Appointment information is temporarily unavailable.',
      );
    }
  }

  private validateDates(dto: VoiceAppointmentSearchDto): void {
    for (const field of ['startDate', 'endDate'] as const) {
      const value = dto[field];
      if (value && !DateTime.fromISO(value, { zone: 'utc' }).isValid)
        throw new FieldValidationException([
          { field, message: `${field} must be a valid YYYY-MM-DD date.` },
        ]);
    }
    if (dto.endDate && !dto.startDate)
      throw new FieldValidationException([
        { field: 'endDate', message: 'startDate is required with endDate.' },
      ]);
    if (dto.startDate && dto.endDate && dto.endDate < dto.startDate)
      throw new FieldValidationException([
        { field: 'endDate', message: 'endDate cannot precede startDate.' },
      ]);
  }

  private matchesLocalDates(
    startAt: Date,
    timezone: string,
    dto: VoiceAppointmentSearchDto,
  ): boolean {
    const local = DateTime.fromJSDate(startAt).setZone(timezone);
    if (!local.isValid) throw new Error('Invalid appointment timezone.');
    const date = local.toFormat('yyyy-LL-dd');
    if (!dto.startDate) return true;
    const end = dto.endDate ?? dto.startDate;
    return date >= dto.startDate && date <= end;
  }

  private async localDateScope(
    tenantId: string,
    startDate: string,
    endDate: string,
  ) {
    const locations = await this.prisma.location.findMany({
      where: { tenantId },
      select: { id: true, timezone: true },
    });
    return locations.map((location) => {
      const start = DateTime.fromISO(`${startDate}T00:00`, {
        zone: location.timezone,
        setZone: true,
      });
      const end = DateTime.fromISO(`${endDate}T00:00`, {
        zone: location.timezone,
        setZone: true,
      }).plus({ days: 1 });
      if (!start.isValid || !end.isValid)
        throw new Error('Invalid appointment timezone.');
      return {
        locationId: location.id,
        startAt: { gte: start.toJSDate(), lt: end.toJSDate() },
      };
    });
  }
}

function terms(value?: string): string[] {
  return value
    ? value
        .normalize('NFKD')
        .replace(/[\u0300-\u036f]/g, '')
        .split(/[^\p{L}\p{N}]+/u)
        .filter(Boolean)
        .slice(0, 12)
    : [];
}

function formatAppointment(item: {
  appointmentNumber: string;
  startAt: Date;
  endAt: Date;
  status: AppointmentStatus;
  location: { name: string; timezone: string };
  provider: {
    firstName: string;
    lastName: string;
    displayName: string | null;
    title: string | null;
  };
  service: { name: string };
}): VoiceAppointmentDetails {
  const start = DateTime.fromJSDate(item.startAt).setZone(
    item.location.timezone,
  );
  const end = DateTime.fromJSDate(item.endAt).setZone(item.location.timezone);
  if (!start.isValid || !end.isValid) throw new Error('Invalid timezone.');
  const providerName =
    item.provider.displayName ??
    [item.provider.title, item.provider.firstName, item.provider.lastName]
      .filter(Boolean)
      .join(' ');
  return {
    appointmentReference: item.appointmentNumber,
    date: start.toFormat('yyyy-LL-dd'),
    startTime: start.toFormat('HH:mm'),
    endTime: end.toFormat('HH:mm'),
    timezone: item.location.timezone,
    providerName,
    serviceName: item.service.name,
    locationName: item.location.name,
    status: item.status,
  };
}
