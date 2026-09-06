import { CorsOptionsDelegate } from '@nestjs/common/interfaces/external/cors-options.interface';
import { IncomingMessage } from 'http';
import { normalizeWebOrigin } from './web-origin-policy';

const WIDGET_SESSION_PATH = '/api/v1/voice/web/widget-session';

/** Preflight is transport-only; POST authorization remains channel-specific. */
export function widgetAwareCors(
  configuredOrigins: readonly string[],
): CorsOptionsDelegate<IncomingMessage> {
  return (request, callback) => {
    if (request.url?.split('?')[0] !== WIDGET_SESSION_PATH) {
      callback(null, { origin: [...configuredOrigins], credentials: true });
      return;
    }

    const rawOrigin = request.headers.origin;
    let validOrigin = false;
    if (typeof rawOrigin === 'string' && !rawOrigin.includes(',')) {
      try {
        normalizeWebOrigin(rawOrigin);
        validOrigin = true;
      } catch {
        // Invalid origins receive no browser-readable CORS grant.
      }
    }
    callback(null, {
      origin: validOrigin ? rawOrigin : false,
      credentials: false,
      methods: ['POST'],
      allowedHeaders: ['Content-Type'],
      maxAge: 600,
    });
  };
}
