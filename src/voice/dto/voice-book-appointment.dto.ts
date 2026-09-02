import { Transform } from 'class-transformer';
import {
  IsBoolean,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
} from 'class-validator';

const trim = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;

export class VoiceBookAppointmentDto {
  @Transform(trim)
  @IsString()
  @MaxLength(200)
  serviceName!: string;

  @Transform(trim)
  @IsString()
  @MaxLength(200)
  providerName!: string;

  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  appointmentDate!: string;

  @Matches(/^\d{2}:\d{2}$/)
  startTime!: string;

  @IsOptional()
  @IsBoolean()
  confirmed?: boolean;
}
