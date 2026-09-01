import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsString, MaxLength, MinLength } from 'class-validator';

export class VoiceFaqSearchDto {
  @ApiProperty({
    maxLength: 500,
    examples: ['parking', 'Do you accept Aetna?', 'opening hours'],
  })
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsString()
  @MinLength(1)
  @MaxLength(500)
  query!: string;
}
