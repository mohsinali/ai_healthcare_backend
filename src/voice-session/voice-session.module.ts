import { Module } from '@nestjs/common';
import { RedisModule } from '../redis/redis.module';
import { VoiceSessionService } from './voice-session.service';

@Module({
  imports: [RedisModule],
  providers: [VoiceSessionService],
  exports: [VoiceSessionService],
})
export class VoiceSessionModule {}
