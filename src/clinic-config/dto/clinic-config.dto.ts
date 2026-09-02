import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { ConfigurationStatus, DayOfWeek } from '@prisma/client';
import { Type } from 'class-transformer';
import {
  ArrayNotEmpty,
  ArrayMaxSize,
  ArrayUnique,
  IsArray,
  IsBoolean,
  IsEmail,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';

export class ListConfigurationDto {
  @Type(() => Number) @IsInt() @Min(1) page = 1;
  @Type(() => Number) @IsInt() @Min(1) @Max(100) limit = 20;
  @IsOptional() @IsString() @MaxLength(100) search?: string;
  @IsOptional() @IsEnum(ConfigurationStatus) status?: ConfigurationStatus;
}

export class CreateLocationDto {
  @ApiProperty() @IsString() @MinLength(1) @MaxLength(120) name!: string;
  @ApiProperty({ example: '+13055550123' })
  @IsString()
  @MaxLength(30)
  phone!: string;
  @ApiPropertyOptional()
  @IsOptional()
  @IsEmail()
  @MaxLength(254)
  email?: string;
  @ApiProperty({ example: 'America/New_York' })
  @IsString()
  @MaxLength(100)
  timezone!: string;
  @ApiProperty()
  @IsString()
  @MinLength(1)
  @MaxLength(160)
  addressLine1!: string;
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(160)
  addressLine2?: string;
  @ApiProperty() @IsString() @MinLength(1) @MaxLength(100) city!: string;
  @ApiProperty()
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  stateProvince!: string;
  @ApiProperty() @IsString() @MinLength(1) @MaxLength(24) postalCode!: string;
  @ApiProperty({ example: 'US' })
  @Matches(/^[A-Za-z]{2}$/)
  countryCode!: string;
  @ApiPropertyOptional({ example: '+13055550124' })
  @IsOptional()
  @IsString()
  @MaxLength(30)
  escalationPhoneNumber?: string;
}
export class UpdateLocationDto extends PartialType(CreateLocationDto) {
  @ApiPropertyOptional({ enum: ConfigurationStatus })
  @IsOptional()
  @IsEnum(ConfigurationStatus)
  status?: ConfigurationStatus;
}

export class BusinessHourDto {
  @IsEnum(DayOfWeek) dayOfWeek!: DayOfWeek;
  @IsBoolean() isClosed!: boolean;
  @IsOptional() @Matches(/^([01]\d|2[0-3]):[0-5]\d$/) openTime?: string | null;
  @IsOptional() @Matches(/^([01]\d|2[0-3]):[0-5]\d$/) closeTime?: string | null;
}
export class UpdateBusinessHoursDto {
  @IsArray()
  @ArrayNotEmpty()
  @ArrayUnique((item: BusinessHourDto) => item.dayOfWeek)
  @ValidateNested({ each: true })
  @Type(() => BusinessHourDto)
  hours!: BusinessHourDto[];
}

export class EditLocationDto extends UpdateLocationDto {
  @IsArray()
  @ArrayUnique()
  @IsUUID('4', { each: true })
  serviceIds!: string[];

  @IsArray()
  @ArrayNotEmpty()
  @ArrayUnique((item: BusinessHourDto) => item.dayOfWeek)
  @ValidateNested({ each: true })
  @Type(() => BusinessHourDto)
  businessHours!: BusinessHourDto[];
}

export class CreateProviderDto {
  @IsString() @MinLength(1) @MaxLength(80) firstName!: string;
  @IsString() @MinLength(1) @MaxLength(80) lastName!: string;
  @IsOptional() @IsString() @MaxLength(160) displayName?: string;
  @IsOptional() @IsString() @MaxLength(80) title?: string;
  @IsOptional() @IsEmail() @MaxLength(254) email?: string;
  @IsOptional() @IsString() @MaxLength(30) phone?: string;
}
export class UpdateProviderDto extends PartialType(CreateProviderDto) {
  @IsOptional() @IsEnum(ConfigurationStatus) status?: ConfigurationStatus;
}
export class EditProviderDto extends UpdateProviderDto {
  @IsArray() @ArrayUnique() @IsUUID('4', { each: true }) locationIds!: string[];
  @IsArray() @ArrayUnique() @IsUUID('4', { each: true }) serviceIds!: string[];
}

export class CreateServiceDto {
  @IsString() @MinLength(1) @MaxLength(120) name!: string;
  @IsOptional() @IsString() @MaxLength(1000) description?: string;
  @IsInt() @Min(1) @Max(1440) durationMinutes!: number;
}
export class UpdateServiceDto extends PartialType(CreateServiceDto) {
  @IsOptional() @IsEnum(ConfigurationStatus) status?: ConfigurationStatus;
}
export class EditServiceDto extends UpdateServiceDto {
  @IsArray() @ArrayUnique() @IsUUID('4', { each: true }) locationIds!: string[];
  @IsArray() @ArrayUnique() @IsUUID('4', { each: true }) providerIds!: string[];
}

export class ReplaceAssignmentsDto {
  @IsArray() @ArrayUnique() @IsUUID('4', { each: true }) ids!: string[];
}

export class ProviderWorkingPeriodDto {
  @ApiProperty({ enum: DayOfWeek })
  @IsEnum(DayOfWeek)
  dayOfWeek!: DayOfWeek;

  @ApiProperty({ example: '09:00' })
  @Matches(/^([01]\d|2[0-3]):[0-5]\d$/)
  startTime!: string;

  @ApiProperty({ example: '17:00' })
  @Matches(/^([01]\d|2[0-3]):[0-5]\d$/)
  endTime!: string;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean = true;
}

export class ReplaceProviderWorkingPeriodsDto {
  @ApiProperty({ type: [ProviderWorkingPeriodDto], maxItems: 100 })
  @IsArray()
  @ArrayMaxSize(100)
  @ValidateNested({ each: true })
  @Type(() => ProviderWorkingPeriodDto)
  periods!: ProviderWorkingPeriodDto[];
}
