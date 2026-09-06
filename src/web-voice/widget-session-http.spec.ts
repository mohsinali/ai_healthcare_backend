import { ForbiddenException, INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { Server } from 'http';
import * as request from 'supertest';
import { WebVoiceSessionController } from './web-voice-session.controller';
import { WebVoiceSessionService } from './web-voice-session.service';
import { widgetAwareCors } from './widget-cors';

describe('external widget HTTP/CORS boundary', () => {
  let app: INestApplication;
  const createExternal = jest.fn();

  beforeAll(async () => {
    const module = await Test.createTestingModule({
      controllers: [WebVoiceSessionController],
      providers: [
        {
          provide: WebVoiceSessionService,
          useValue: { create: jest.fn(), createExternal },
        },
      ],
    }).compile();
    app = module.createNestApplication();
    app.enableCors(widgetAwareCors(['https://careflow.example']));
    app.setGlobalPrefix('api/v1');
    await app.init();
  });

  afterAll(async () => app.close());
  beforeEach(() => createExternal.mockReset());

  it('completes transport preflight without credentials or widget authorization', async () => {
    const response = await request(app.getHttpServer() as Server)
      .options('/api/v1/voice/web/widget-session')
      .set('Origin', 'https://unconfigured.example')
      .set('Access-Control-Request-Method', 'POST')
      .set('Access-Control-Request-Headers', 'content-type')
      .expect(204);
    expect(response.headers['access-control-allow-origin']).toBe(
      'https://unconfigured.example',
    );
    expect(response.headers.vary).toMatch(/Origin/);
    expect(response.headers['access-control-allow-methods']).toBe('POST');
    expect(response.headers['access-control-allow-headers']).toBe(
      'Content-Type',
    );
    expect(
      response.headers['access-control-allow-credentials'],
    ).toBeUndefined();
    expect(createExternal).not.toHaveBeenCalled();
  });

  it('keeps POST authorization authoritative after successful preflight', async () => {
    createExternal.mockRejectedValue(
      new ForbiddenException('Web voice widget is unavailable.'),
    );
    const response = await request(app.getHttpServer() as Server)
      .post('/api/v1/voice/web/widget-session')
      .set('Origin', 'https://unconfigured.example')
      .send({ widgetKey: `wgt_${'a'.repeat(43)}` })
      .expect(403);
    expect(response.headers['access-control-allow-origin']).toBe(
      'https://unconfigured.example',
    );
    expect(response.headers['cache-control']).toBe('no-store');
    expect(
      response.headers['access-control-allow-credentials'],
    ).toBeUndefined();
    expect(createExternal).toHaveBeenCalledWith(
      `wgt_${'a'.repeat(43)}`,
      'https://unconfigured.example',
      expect.any(String) as string,
    );
  });
});
