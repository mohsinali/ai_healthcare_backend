import { ApiProperty } from '@nestjs/swagger';
import { IsString, Matches, MaxLength } from 'class-validator';

export class VoiceIdentifyPatientDto {
  @ApiProperty({ example: 'Jane' })
  @IsString()
  @MaxLength(80)
  @Matches(/\S/, { message: 'First name is required.' })
  firstName!: string;

  @ApiProperty({ example: 'Doe' })
  @IsString()
  @MaxLength(80)
  @Matches(/\S/, { message: 'Last name is required.' })
  lastName!: string;

  @ApiProperty({ example: '1985-04-17' })
  @Matches(/^\d{4}-\d{2}-\d{2}$/, {
    message: 'Date of birth must use YYYY-MM-DD format.',
  })
  dateOfBirth!: string;
}

export class VoiceVerifyPatientDto {
  @ApiProperty({ example: '+1 416 555 0123' })
  @IsString()
  @MaxLength(30)
  @Matches(/\S/, { message: 'Phone number is required.' })
  phoneNumber!: string;
}
