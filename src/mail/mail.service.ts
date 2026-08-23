import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);
  constructor(private readonly config: ConfigService) {}
  sendPasswordReset(email: string, token: string): Promise<void> {
    if (this.config.get('NODE_ENV') === 'production') {
      this.logger.warn('Password-reset mail transport is not configured');
      return Promise.resolve();
    }
    const url = `${this.config.getOrThrow('FRONTEND_URL')}/reset-password?token=${encodeURIComponent(token)}`;
    this.logger.log(`Development password reset for ${email}: ${url}`);
    return Promise.resolve();
  }
}
