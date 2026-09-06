import { ApiProperty } from '@nestjs/swagger';
import { IsBoolean, IsDefined, Matches } from 'class-validator';

export class VoiceRescheduleAppointmentDto {
  @ApiProperty({
    example: '2026-09-12',
    description: 'Proposed appointment date in the location timezone.',
    pattern: '^\\d{4}-\\d{2}-\\d{2}$',
  })
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  appointmentDate!: string;

  @ApiProperty({
    example: '14:30',
    description: 'Proposed start time in 24-hour HH:mm format.',
    pattern: '^\\d{2}:\\d{2}$',
  })
  @Matches(/^\d{2}:\d{2}$/)
  startTime!: string;

  @ApiProperty({
    example: false,
    description:
      'Set to false to preview the change, then true to confirm the same proposal.',
  })
  @IsDefined()
  @IsBoolean()
  confirmed!: boolean;
}
