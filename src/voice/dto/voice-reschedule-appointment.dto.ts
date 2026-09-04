import { IsBoolean, IsDefined, Matches } from 'class-validator';

export class VoiceRescheduleAppointmentDto {
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  appointmentDate!: string;

  @Matches(/^\d{2}:\d{2}$/)
  startTime!: string;

  @IsDefined()
  @IsBoolean()
  confirmed!: boolean;
}
