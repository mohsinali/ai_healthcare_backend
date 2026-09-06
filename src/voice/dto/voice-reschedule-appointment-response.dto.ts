import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export const voiceRescheduleStatuses = [
  'confirmation_required',
  'ok',
  'verification_required',
  'appointment_selection_required',
  'appointment_not_reschedulable',
  'slot_unavailable',
  'invalid_appointment_time',
  'reschedule_failed',
] as const;

export class VoiceAppointmentSummaryDto {
  @ApiProperty({ example: 'APT-00123' })
  appointmentReference!: string;

  @ApiProperty({ example: '2026-09-12' })
  date!: string;

  @ApiProperty({ example: '14:30' })
  startTime!: string;

  @ApiProperty({ example: '15:00' })
  endTime!: string;

  @ApiProperty({ example: 'Asia/Karachi' })
  timezone!: string;

  @ApiProperty({ example: 'Dr. Ali Tahir' })
  providerName!: string;

  @ApiProperty({ example: 'Consultation' })
  serviceName!: string;

  @ApiProperty({ example: 'Qureshi Medical Centre' })
  locationName!: string;

  @ApiPropertyOptional({ example: 'BOOKED' })
  status?: string;
}

export class VoiceProposedAppointmentSummaryDto {
  @ApiProperty({ example: '2026-09-12' })
  date!: string;

  @ApiProperty({ example: '14:30' })
  startTime!: string;

  @ApiProperty({ example: '15:00' })
  endTime!: string;

  @ApiProperty({ example: 'Asia/Karachi' })
  timezone!: string;

  @ApiProperty({ example: 'Dr. Ali Tahir' })
  providerName!: string;

  @ApiProperty({ example: 'Consultation' })
  serviceName!: string;

  @ApiProperty({ example: 'Qureshi Medical Centre' })
  locationName!: string;
}

export class VoiceRescheduleAppointmentResponseDto {
  @ApiProperty({
    enum: voiceRescheduleStatuses,
    example: 'confirmation_required',
  })
  status!: (typeof voiceRescheduleStatuses)[number];

  @ApiProperty({ example: 'Please confirm the proposed appointment change.' })
  message!: string;

  @ApiPropertyOptional({ type: VoiceAppointmentSummaryDto })
  currentAppointment?: VoiceAppointmentSummaryDto;

  @ApiPropertyOptional({ type: VoiceProposedAppointmentSummaryDto })
  proposedAppointment?: VoiceProposedAppointmentSummaryDto;

  @ApiPropertyOptional({ type: VoiceAppointmentSummaryDto })
  appointment?: VoiceAppointmentSummaryDto;
}
