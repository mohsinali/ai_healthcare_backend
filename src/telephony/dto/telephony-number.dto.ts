import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { TelephonyNumberStatus, TelephonyProvider } from '@prisma/client';
import { Type } from 'class-transformer';
import {
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

export class ListTelephonyNumbersDto {
  @Type(() => Number) @IsInt() @Min(1) page = 1;
  @Type(() => Number) @IsInt() @Min(1) @Max(100) limit = 20;
  @ApiPropertyOptional({ maxLength: 100 })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  search?: string;
  @ApiPropertyOptional({ enum: TelephonyNumberStatus })
  @IsOptional()
  @IsEnum(TelephonyNumberStatus)
  status?: TelephonyNumberStatus;
  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  locationId?: string;
}

export class TelephonyNumberInputDto {
  @ApiPropertyOptional({ format: 'uuid', nullable: true })
  @IsOptional()
  @IsUUID()
  locationId?: string | null;
  @ApiProperty({
    example: '+13055551001',
    description:
      'International phone number; stored in normalized E.164 format.',
  })
  @IsString()
  @MinLength(1)
  @MaxLength(50)
  phoneNumber!: string;
  @ApiProperty({ enum: TelephonyProvider })
  @IsEnum(TelephonyProvider)
  provider!: TelephonyProvider;
  @ApiPropertyOptional({
    nullable: true,
    maxLength: 255,
    description:
      'Optional provider-side identifier reserved for future integration.',
  })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  providerPhoneNumberId?: string | null;
}

export class CreateTelephonyNumberDto extends TelephonyNumberInputDto {}
export class UpdateTelephonyNumberDto extends PartialType(
  TelephonyNumberInputDto,
) {}

export class UpdateTelephonyNumberStatusDto {
  @ApiProperty({ enum: TelephonyNumberStatus })
  @IsEnum(TelephonyNumberStatus)
  status!: TelephonyNumberStatus;
}
