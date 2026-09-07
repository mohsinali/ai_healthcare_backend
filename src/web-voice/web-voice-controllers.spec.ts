import { PlatformRole } from '@prisma/client';
import { PLATFORM_ROLES_KEY } from '../auth/decorators/platform-roles.decorator';
import { IS_PUBLIC_KEY } from '../auth/decorators/public.decorator';
import { TENANT_CONTEXT_REQUIRED_KEY } from '../tenants/decorators/tenant-context-required.decorator';
import { CreateWebVoiceSessionDto } from './dto/create-web-voice-session.dto';
import { WebVoiceChannelsController } from './web-voice-channels.controller';
import { WebVoiceSessionController } from './web-voice-session.controller';
import { HEADERS_METADATA } from '@nestjs/common/constants';

/* Controller method references are inspected as metadata targets, never invoked. */
/* eslint-disable @typescript-eslint/unbound-method */

describe('Web voice controller security boundaries', () => {
  it('marks only the browser session controller public', () => {
    expect(Reflect.getMetadata(IS_PUBLIC_KEY, WebVoiceSessionController)).toBe(
      true,
    );
    expect(
      Reflect.getMetadata(IS_PUBLIC_KEY, WebVoiceChannelsController),
    ).toBeUndefined();
    expect(
      Reflect.getMetadata(
        TENANT_CONTEXT_REQUIRED_KEY,
        WebVoiceChannelsController,
      ),
    ).toBe(true);
  });

  it('reserves every channel management operation for super admins', () => {
    expect(
      Reflect.getMetadata(PLATFORM_ROLES_KEY, WebVoiceChannelsController),
    ).toEqual([PlatformRole.SUPER_ADMIN]);
    for (const method of [
      'list',
      'locations',
      'create',
      'get',
      'update',
      'status',
    ] as const) {
      expect(WebVoiceChannelsController.prototype[method]).toBeDefined();
    }
  });

  it('defines no browser-controlled routing or PHI fields', () => {
    expect(Object.getOwnPropertyNames(new CreateWebVoiceSessionDto())).toEqual([
      'widgetKey',
    ]);
    expect([
      'tenantId',
      'locationId',
      'agentId',
      'apiKey',
      'patientName',
      'dateOfBirth',
    ]).not.toContain('widgetKey');
  });

  it('prevents caching the response that contains the raw session token', () => {
    const headers = Reflect.getMetadata(
      HEADERS_METADATA,
      WebVoiceSessionController.prototype.create,
    ) as Array<{ name: string; value: string }>;
    expect(headers).toContainEqual({
      name: 'Cache-Control',
      value: 'no-store',
    });
    const externalHeaders = Reflect.getMetadata(
      HEADERS_METADATA,
      WebVoiceSessionController.prototype.createWidgetSession,
    ) as Array<{ name: string; value: string }>;
    expect(externalHeaders).toContainEqual({
      name: 'Cache-Control',
      value: 'no-store',
    });
  });
});
