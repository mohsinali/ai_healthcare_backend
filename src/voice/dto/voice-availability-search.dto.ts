import { Transform } from 'class-transformer';
import {
  IsEnum,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
} from 'class-validator';
import { AvailabilityTimeOfDay } from '../../appointments/availability-search.service';

const trim = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() || undefined : value;

export class VoiceAvailabilitySearchDto {
  @Transform(trim)
  @IsString()
  @MaxLength(200)
  serviceName!: string;

  @Transform(trim)
  @IsOptional()
  @IsString()
  @MaxLength(200)
  providerName?: string;

  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  startDate?: string;

  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  endDate?: string;

  @IsOptional()
  @IsEnum(['any', 'morning', 'afternoon', 'evening'])
  timeOfDay?: AvailabilityTimeOfDay;
}
