import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import {
  InboundNumberResolutionError,
  InboundNumberResolutionFailure,
} from '../telephony/inbound-number-resolution.error';
import { InboundNumberResolverService } from '../telephony/inbound-number-resolver.service';
import { VoiceBootstrapResponse, VoiceContext } from './context/voice-context';

@Injectable()
export class VoiceBootstrapService {
  private readonly logger = new Logger(VoiceBootstrapService.name);

  constructor(private readonly inboundNumbers: InboundNumberResolverService) {}

  async bootstrap(calledNumber: string): Promise<VoiceBootstrapResponse> {
    let context: VoiceContext;
    try {
      const resolved = await this.inboundNumbers.resolve(calledNumber);
      context = {
        telephonyNumberId: resolved.telephonyNumberId,
        calledNumber: resolved.phoneNumber,
        provider: resolved.provider,
        tenantId: resolved.tenantId,
        tenantName: resolved.tenantName,
        locationId: resolved.locationId,
        locationName: resolved.locationName,
        timezone: resolved.timezone,
        escalationPhoneNumber: resolved.escalationPhoneNumber,
      };
    } catch (error) {
      if (error instanceof InboundNumberResolutionError) {
        this.logger.warn({
          event: 'voice_bootstrap_failed',
          reason: error.reason,
        });
        if (
          error.reason === InboundNumberResolutionFailure.INVALID_PHONE_NUMBER
        ) {
          throw new BadRequestException(
            'calledNumber must be a valid phone number.',
          );
        }
        throw new NotFoundException(
          'Inbound voice destination is unavailable.',
        );
      }
      this.logger.error({
        event: 'voice_bootstrap_failed',
        reason: 'dependency_error',
      });
      throw error;
    }

    this.logger.log({
      event: 'voice_bootstrap_success',
      provider: context.provider,
      locationScoped: context.locationId !== null,
    });
    return {
      context: {
        tenantId: context.tenantId,
        tenantName: context.tenantName,
        locationId: context.locationId,
        locationName: context.locationName,
        timezone: context.timezone,
      },
      calledNumber: context.calledNumber,
    };
  }
}
