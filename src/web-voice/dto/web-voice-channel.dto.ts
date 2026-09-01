import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { WebVoiceChannelStatus } from '@prisma/client';
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
} from 'class-validator';

export class CreateWebVoiceChannelDto {
  @ApiPropertyOptional({ format: 'uuid', nullable: true })
  @IsOptional()
  @IsUUID()
  locationId?: string | null;

  @ApiPropertyOptional({ nullable: true, maxLength: 255 })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  agentId?: string | null;
}

export class UpdateWebVoiceChannelDto extends PartialType(
  CreateWebVoiceChannelDto,
) {}

export class UpdateWebVoiceChannelStatusDto {
  @ApiProperty({ enum: WebVoiceChannelStatus })
  @IsEnum(WebVoiceChannelStatus)
  status!: WebVoiceChannelStatus;
}

export class ListWebVoiceChannelsDto {
  @Type(() => Number) @IsInt() @Min(1) page = 1;
  @Type(() => Number) @IsInt() @Min(1) @Max(100) limit = 20;
  @ApiPropertyOptional({ enum: WebVoiceChannelStatus })
  @IsOptional()
  @IsEnum(WebVoiceChannelStatus)
  status?: WebVoiceChannelStatus;
  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  locationId?: string;
}
