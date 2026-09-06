import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { VoiceAppointmentSummaryDto } from './voice-reschedule-appointment-response.dto';

export const voiceCancellationStatuses = [
  'confirmation_required',
  'ok',
  'verification_required',
  'appointment_selection_required',
  'appointment_not_cancellable',
  'cancellation_failed',
] as const;

export class VoiceCancelAppointmentResponseDto {
  @ApiProperty({ enum: voiceCancellationStatuses })
  status!: (typeof voiceCancellationStatuses)[number];

  @ApiProperty()
  message!: string;

  @ApiPropertyOptional({ type: VoiceAppointmentSummaryDto })
  appointment?: VoiceAppointmentSummaryDto;
}
