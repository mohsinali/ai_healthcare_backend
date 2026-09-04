import { Transform } from 'class-transformer';
import { IsOptional, IsString, Matches, MaxLength } from 'class-validator';

const trim = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() || undefined : value;

export class VoiceAppointmentSearchDto {
  @Transform(trim)
  @IsOptional()
  @IsString()
  @MaxLength(100)
  appointmentReference?: string;

  @Transform(trim)
  @IsOptional()
  @IsString()
  @MaxLength(200)
  providerName?: string;

  @Transform(trim)
  @IsOptional()
  @IsString()
  @MaxLength(200)
  locationName?: string;

  @Transform(trim)
  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  startDate?: string;

  @Transform(trim)
  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  endDate?: string;
}
