import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsOptional, IsString, MaxLength } from 'class-validator';

function trimmedOptional(value: unknown): unknown {
  if (typeof value !== 'string') return value;
  const trimmed = value.trim();
  return trimmed.length === 0 ? undefined : trimmed;
}

export class VoiceServiceSearchDto {
  @ApiPropertyOptional({ maxLength: 200, example: 'pediatric consultation' })
  @Transform(({ value }: { value: unknown }) => trimmedOptional(value))
  @IsOptional()
  @IsString()
  @MaxLength(200)
  query?: string;
}
