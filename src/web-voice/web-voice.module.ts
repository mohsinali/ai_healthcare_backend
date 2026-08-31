import { Module } from '@nestjs/common';
import { DatabaseModule } from '../database/database.module';
import { ElevenLabsService } from './elevenlabs.service';
import { WebVoiceChannelResolverService } from './web-voice-channel-resolver.service';
import { WebVoiceChannelsController } from './web-voice-channels.controller';
import { WebVoiceChannelsService } from './web-voice-channels.service';
import { WebVoiceSessionController } from './web-voice-session.controller';
import { WebVoiceSessionService } from './web-voice-session.service';
import { VoiceSessionModule } from '../voice-session/voice-session.module';

@Module({
  imports: [DatabaseModule, VoiceSessionModule],
  controllers: [WebVoiceChannelsController, WebVoiceSessionController],
  providers: [
    WebVoiceChannelsService,
    WebVoiceChannelResolverService,
    ElevenLabsService,
    WebVoiceSessionService,
  ],
  exports: [WebVoiceChannelResolverService],
})
export class WebVoiceModule {}
