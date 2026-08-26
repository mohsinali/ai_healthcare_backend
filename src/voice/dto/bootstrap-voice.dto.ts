import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString } from 'class-validator';

export class BootstrapVoiceDto {
  @ApiProperty({ example: '+1 305 555 1001' })
  @IsString()
  @IsNotEmpty()
  calledNumber!: string;
}
