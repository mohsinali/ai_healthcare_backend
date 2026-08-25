import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { AppointmentStatus } from '@prisma/client';
import { Type } from 'class-transformer';
import {
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

export class AvailabilityDto {
  @IsUUID() locationId!: string;
  @IsUUID() serviceId!: string;
  @IsUUID() providerId!: string;
  @Matches(/^\d{4}-\d{2}-\d{2}$/) date!: string;
}

export class EligibleProvidersDto {
  @IsUUID() locationId!: string;
  @IsUUID() serviceId!: string;
}

export class CreateAppointmentDto {
  @ApiProperty() @IsUUID() patientId!: string;
  @ApiProperty() @IsUUID() locationId!: string;
  @ApiProperty() @IsUUID() providerId!: string;
  @ApiProperty() @IsUUID() serviceId!: string;
  @ApiProperty({ example: '2026-09-10T10:30:00-04:00' })
  @IsString()
  @MaxLength(50)
  start!: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(500) reason?:
    string | null;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(2000) notes?:
    string | null;
}

export class RescheduleAppointmentDto {
  @IsOptional() @IsUUID() providerId?: string;
  @IsString() @MaxLength(50) start!: string;
}

export class CancelAppointmentDto {
  @IsOptional() @IsString() @MaxLength(500) reason?: string | null;
}

class AdministrativeFields {
  @IsOptional() @IsString() @MaxLength(500) reason?: string | null;
  @IsOptional() @IsString() @MaxLength(2000) notes?: string | null;
}
export class UpdateAppointmentDto extends PartialType(AdministrativeFields) {}

export class ListAppointmentsDto {
  @Type(() => Number) @IsInt() @Min(1) page = 1;
  @Type(() => Number) @IsInt() @Min(1) @Max(100) limit = 20;
  @IsOptional() @IsString() @MaxLength(100) search?: string;
  @IsOptional() @IsEnum(AppointmentStatus) status?: AppointmentStatus;
  @IsOptional() @IsUUID() locationId?: string;
  @IsOptional() @IsUUID() providerId?: string;
  @IsOptional() @IsUUID() serviceId?: string;
  @IsOptional() @IsUUID() patientId?: string;
  @IsOptional() @Matches(/^\d{4}-\d{2}-\d{2}$/) dateFrom?: string;
  @IsOptional() @Matches(/^\d{4}-\d{2}-\d{2}$/) dateTo?: string;
}
