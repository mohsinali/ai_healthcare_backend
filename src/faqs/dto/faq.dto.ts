import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { FAQCategory, FAQStatus } from '@prisma/client';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
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

export class ListFaqsDto {
  @Type(() => Number) @IsInt() @Min(1) page = 1;
  @Type(() => Number) @IsInt() @Min(1) @Max(100) limit = 20;
  @ApiPropertyOptional({ maxLength: 100 })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  search?: string;
  @ApiPropertyOptional({ enum: FAQStatus })
  @IsOptional()
  @IsEnum(FAQStatus)
  status?: FAQStatus;
  @ApiPropertyOptional({ enum: FAQCategory })
  @IsOptional()
  @IsEnum(FAQCategory)
  category?: FAQCategory;
  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  locationId?: string;
}

export class FaqInputDto {
  @ApiPropertyOptional({ format: 'uuid', nullable: true })
  @IsOptional()
  @IsUUID()
  locationId?: string | null;
  @ApiProperty({ enum: FAQCategory })
  @IsEnum(FAQCategory)
  category!: FAQCategory;
  @ApiProperty({ maxLength: 500 })
  @IsString()
  @MinLength(1)
  @MaxLength(500)
  question!: string;
  @ApiProperty({ maxLength: 8000, description: 'Clinic-approved plain text.' })
  @IsString()
  @MinLength(1)
  @MaxLength(8000)
  answer!: string;
  @ApiPropertyOptional({ type: [String], maxItems: 20 })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20)
  @IsString({ each: true })
  @MaxLength(100, { each: true })
  keywords?: string[];
}

export class CreateFaqDto extends FaqInputDto {}
export class UpdateFaqDto extends PartialType(FaqInputDto) {}

export class UpdateFaqStatusDto {
  @ApiProperty({ enum: FAQStatus })
  @IsEnum(FAQStatus)
  status!: FAQStatus;
}
