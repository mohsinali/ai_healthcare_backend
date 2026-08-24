import { ApiProperty } from '@nestjs/swagger';
import { DateFormat } from '@prisma/client';
import { IsEnum, IsTimeZone, Matches } from 'class-validator';

export class UpdateSettingsDto {
  @ApiProperty({ enum: DateFormat })
  @IsEnum(DateFormat, { message: 'Select a valid date format.' })
  dateFormat!: DateFormat;

  @ApiProperty({ example: 'America/New_York' })
  @IsTimeZone({ message: 'Select a valid timezone.' })
  @Matches(/^(?:UTC|[A-Za-z._+-]+(?:\/[A-Za-z0-9._+-]+)+)$/, {
    message: 'Select a valid timezone.',
  })
  timezone!: string;
}
