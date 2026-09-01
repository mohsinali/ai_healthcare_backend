import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsOptional, IsString, MaxLength } from 'class-validator';

function trimmedOptional(value: unknown): unknown {
  if (typeof value !== 'string') return value;
  const trimmed = value.trim();
  return trimmed.length === 0 ? undefined : trimmed;
}

export class VoiceProviderSearchDto {
  @ApiPropertyOptional({ maxLength: 200, example: 'Sarah Ahmed' })
  @Transform(({ value }: { value: unknown }) => trimmedOptional(value))
  @IsOptional()
  @IsString()
  @MaxLength(200)
  query?: string;

  @ApiPropertyOptional({ maxLength: 200, example: 'General Consultation' })
  @Transform(({ value }: { value: unknown }) => trimmedOptional(value))
  @IsOptional()
  @IsString()
  @MaxLength(200)
  serviceName?: string;
}
