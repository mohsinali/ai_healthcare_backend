import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { PatientStatus, PreferredContactMethod } from '@prisma/client';
import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsDateString,
  IsEmail,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

export class ListPatientsDto {
  @Type(() => Number) @IsInt() @Min(1) page = 1;
  @Type(() => Number) @IsInt() @Min(1) @Max(100) limit = 20;
  @IsOptional() @IsString() @MaxLength(100) search?: string;
  @IsOptional() @IsEnum(PatientStatus) status?: PatientStatus;
  @IsOptional() @IsDateString({ strict: true }) dateOfBirth?: string;
}
export class PatientInputDto {
  @ApiProperty() @IsString() @MinLength(1) @MaxLength(80) firstName!: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(80) middleName?:
    string | null;
  @ApiProperty() @IsString() @MinLength(1) @MaxLength(80) lastName!: string;
  @ApiProperty({ example: '1988-04-12' })
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  dateOfBirth!: string;
  @ApiProperty({ example: '+13055550123' })
  @IsString()
  @MaxLength(30)
  phone!: string;
  @ApiPropertyOptional()
  @IsOptional()
  @IsEmail({}, { message: 'Enter a valid email address.' })
  @MaxLength(254)
  email?: string | null;
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(160)
  addressLine1?: string | null;
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(160)
  addressLine2?: string | null;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(100) city?:
    string | null;
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(100)
  stateProvince?: string | null;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(24) postalCode?:
    string | null;
  @ApiPropertyOptional({ example: 'US' })
  @IsOptional()
  @Matches(/^[A-Za-z]{2}$/)
  countryCode?: string | null;
  @ApiPropertyOptional({ enum: PreferredContactMethod })
  @IsOptional()
  @IsEnum(PreferredContactMethod)
  preferredContactMethod?: PreferredContactMethod | null;
}
export class CreatePatientDto extends PatientInputDto {
  @ApiPropertyOptional({
    description: 'Explicitly create after reviewing possible duplicates.',
  })
  @IsOptional()
  @IsBoolean()
  createAnyway?: boolean;
}
export class UpdatePatientDto extends PartialType(PatientInputDto) {}
export class DuplicateCheckDto extends PatientInputDto {
  @IsOptional() @IsString() patientId?: string;
}
export class UpdatePatientStatusDto {
  @IsEnum(PatientStatus) status!: PatientStatus;
}
