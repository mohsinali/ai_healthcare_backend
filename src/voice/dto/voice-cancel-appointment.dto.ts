import { ApiProperty } from '@nestjs/swagger';
import { IsBoolean, IsDefined } from 'class-validator';

export class VoiceCancelAppointmentDto {
  @ApiProperty({
    example: false,
    description:
      'Set to false to preview cancellation, then true to confirm that exact preview.',
  })
  @IsDefined()
  @IsBoolean()
  confirmed!: boolean;
}
