import { TenantRole } from '@prisma/client';
import { IS_PUBLIC_KEY } from '../auth/decorators/public.decorator';
import { TENANT_CONTEXT_REQUIRED_KEY } from '../tenants/decorators/tenant-context-required.decorator';
import { TENANT_ROLES_KEY } from '../tenants/decorators/tenant-roles.decorator';
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

  it('allows receptionist reads but reserves writes for owner/admin', () => {
    const read = Reflect.getMetadata(
      TENANT_ROLES_KEY,
      WebVoiceChannelsController.prototype.list,
    ) as TenantRole[];
    const write = Reflect.getMetadata(
      TENANT_ROLES_KEY,
      WebVoiceChannelsController.prototype.create,
    ) as TenantRole[];
    expect(read).toEqual(
      expect.arrayContaining([
        TenantRole.CLINIC_OWNER,
        TenantRole.CLINIC_ADMIN,
        TenantRole.RECEPTIONIST,
      ]),
    );
    expect(write).toEqual([TenantRole.CLINIC_OWNER, TenantRole.CLINIC_ADMIN]);
    expect(
      Reflect.getMetadata(
        TENANT_ROLES_KEY,
        WebVoiceChannelsController.prototype.update,
      ),
    ).toEqual(write);
    expect(
      Reflect.getMetadata(
        TENANT_ROLES_KEY,
        WebVoiceChannelsController.prototype.status,
      ),
    ).toEqual(write);
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
  });
});
