import { ConflictException } from '@nestjs/common';
import { Prisma } from '@prisma/client';

export const appointmentSchedulingCodes = {
  providerNotScheduled: 'PROVIDER_NOT_SCHEDULED',
  outsideProviderSchedule: 'APPOINTMENT_OUTSIDE_PROVIDER_SCHEDULE',
  outsideLocationHours: 'APPOINTMENT_OUTSIDE_LOCATION_HOURS',
  providerConflict: 'PROVIDER_APPOINTMENT_CONFLICT',
  slotUnavailable: 'APPOINTMENT_SLOT_NO_LONGER_AVAILABLE',
} as const;

export type AppointmentSchedulingCode =
  (typeof appointmentSchedulingCodes)[keyof typeof appointmentSchedulingCodes];

export class AppointmentSchedulingException extends ConflictException {
  constructor(
    code: AppointmentSchedulingCode,
    details: {
      providerId: string;
      locationId: string;
      requestedStart: string;
      requestedEnd: string;
      reason?: AppointmentSchedulingCode;
    },
    message = 'That appointment time is no longer available.',
  ) {
    super({ message, code, details });
  }
}

export async function lockProviderAppointmentSchedules(
  tx: Prisma.TransactionClient,
  tenantId: string,
  providerIds: string[],
) {
  for (const providerId of [...new Set(providerIds)].sort())
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`appointment-schedule:${tenantId}:${providerId}`}, 0::bigint))`;
}

export async function lockAppointmentRecord(
  tx: Prisma.TransactionClient,
  tenantId: string,
  appointmentId: string,
) {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`appointment-record:${tenantId}:${appointmentId}`}, 0::bigint))`;
}
