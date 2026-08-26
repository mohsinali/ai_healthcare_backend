import {
  CanActivate,
  ExecutionContext,
  INestApplication,
  Injectable,
  UnauthorizedException,
  ValidationPipe,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { APP_GUARD, Reflector } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import { Server } from 'node:http';
import * as request from 'supertest';
import { IS_PUBLIC_KEY } from '../auth/decorators/public.decorator';
import { InboundNumberResolverService } from '../telephony/inbound-number-resolver.service';
import { VoiceServiceAuthGuard } from './auth/voice-service-auth.guard';
import { VoiceBootstrapController } from './voice-bootstrap.controller';
import { VoiceBootstrapService } from './voice-bootstrap.service';

@Injectable()
class SimulatedGlobalUserJwtGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;
    throw new UnauthorizedException('User authentication required.');
  }
}

describe('VoiceBootstrapController security boundary', () => {
  let app: INestApplication;
  const apiKey = 'voice-gateway-test-key-at-least-32-characters';
  const resolve = jest.fn().mockResolvedValue({
    telephonyNumberId: 'number-a',
    phoneNumber: '+13055551001',
    provider: 'TWILIO',
    providerPhoneNumberId: null,
    tenantId: 'tenant-a',
    tenantName: 'Tenant A',
    tenantSlug: 'tenant-a',
    locationId: 'location-a',
    locationName: 'Location A',
    timezone: 'America/New_York',
    escalationPhoneNumber: null,
  });

  beforeAll(async () => {
    const module = await Test.createTestingModule({
      controllers: [VoiceBootstrapController],
      providers: [
        VoiceBootstrapService,
        VoiceServiceAuthGuard,
        Reflector,
        { provide: APP_GUARD, useClass: SimulatedGlobalUserJwtGuard },
        { provide: ConfigService, useValue: { getOrThrow: () => apiKey } },
        { provide: InboundNumberResolverService, useValue: { resolve } },
      ],
    }).compile();
    app = module.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true }),
    );
    await app.init();
  });

  afterAll(async () => app.close());

  it('bypasses user JWT auth only while still requiring machine auth', async () => {
    await request(app.getHttpServer() as Server)
      .post('/voice/bootstrap')
      .send({ calledNumber: '+13055551001' })
      .expect(401);
    await request(app.getHttpServer() as Server)
      .post('/voice/bootstrap')
      .set('Authorization', 'Bearer header.payload.signature')
      .send({ calledNumber: '+13055551001' })
      .expect(401);
    await request(app.getHttpServer() as Server)
      .post('/voice/bootstrap')
      .set('Authorization', `Bearer ${apiKey}`)
      .send({ calledNumber: '+13055551001' })
      .expect(200)
      .expect(({ body }) => {
        // Supertest exposes response bodies as any at this test boundary.
        // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
        expect(body.context.tenantId).toBe('tenant-a');
      });
  });

  it.each(['tenantId', 'locationId'])(
    'rejects request-supplied routing field %s',
    async (field) => {
      await request(app.getHttpServer() as Server)
        .post('/voice/bootstrap')
        .set('Authorization', `Bearer ${apiKey}`)
        .send({ calledNumber: '+13055551001', [field]: 'tenant-b' })
        .expect(400);
    },
  );
});
