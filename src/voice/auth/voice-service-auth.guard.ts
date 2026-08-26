import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash, timingSafeEqual } from 'node:crypto';
import { Request } from 'express';

@Injectable()
export class VoiceServiceAuthGuard implements CanActivate {
  constructor(private readonly config: ConfigService) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request>();
    const authorization = request.headers.authorization;
    const match = authorization?.match(/^Bearer ([^\s]+)$/);
    if (!match || !this.matchesConfiguredKey(match[1])) {
      throw new UnauthorizedException('Voice service authentication required.');
    }
    return true;
  }

  private matchesConfiguredKey(candidate: string): boolean {
    const configured = this.config.getOrThrow<string>('VOICE_GATEWAY_API_KEY');
    // Fixed-length digests make timingSafeEqual safe even when token lengths differ.
    const candidateDigest = createHash('sha256').update(candidate).digest();
    const configuredDigest = createHash('sha256').update(configured).digest();
    return timingSafeEqual(candidateDigest, configuredDigest);
  }
}
