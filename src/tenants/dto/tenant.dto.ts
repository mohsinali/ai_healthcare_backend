import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { MembershipStatus, TenantRole, TenantStatus } from '@prisma/client';
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
  MinLength,
} from 'class-validator';

export const TENANT_SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
export class CreateTenantDto {
  @ApiProperty({ example: 'Sunshine Dental' })
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  name!: string;
  @ApiProperty({ example: 'sunshine-dental' })
  @IsString()
  @Matches(TENANT_SLUG_PATTERN)
  @MaxLength(80)
  slug!: string;
}
export class UpdateTenantDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  name?: string;
  @ApiPropertyOptional({ enum: TenantStatus })
  @IsOptional()
  @IsEnum(TenantStatus)
  status?: TenantStatus;
}
export class ListTenantsDto {
  @Type(() => Number) @IsInt() @Min(1) page = 1;
  @Type(() => Number) @IsInt() @Min(1) @Max(100) limit = 20;
  @IsOptional() @IsString() @MaxLength(100) search?: string;
  @IsOptional() @IsEnum(TenantStatus) status?: TenantStatus;
  @IsOptional()
  @IsEnum(['createdAt:desc', 'createdAt:asc', 'name:asc', 'name:desc'])
  sort: 'createdAt:desc' | 'createdAt:asc' | 'name:asc' | 'name:desc' =
    'createdAt:desc';
}
export class AddMemberDto {
  @IsUUID() userId!: string;
  @IsEnum(TenantRole) role!: TenantRole;
}
export class UpdateMemberDto {
  @IsOptional() @IsEnum(TenantRole) role?: TenantRole;
  @IsOptional() @IsEnum(MembershipStatus) status?: MembershipStatus;
}
export class UserSearchDto {
  @IsString()
  @MinLength(2)
  @MaxLength(100)
  query!: string;
}
