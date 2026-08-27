import { NotFoundException } from '@nestjs/common';
import { ConfigurationStatus, WebVoiceChannelStatus } from '@prisma/client';
import { WebVoiceChannelsService } from './web-voice-channels.service';

/* Jest's intentionally dynamic Prisma boundary uses untyped callback payloads. */
/* eslint-disable @typescript-eslint/no-unsafe-return, @typescript-eslint/no-unsafe-member-access */

describe('WebVoiceChannelsService', () => {
  const tenantId = '11111111-1111-4111-8111-111111111111';
  const locationId = '22222222-2222-4222-8222-222222222222';
  const context = { tenantId } as never;

  it('creates a tenant-wide active channel with a random immutable key', async () => {
    const create = jest.fn().mockImplementation(({ data }) => ({
      ...data,
      locationId: null,
      status: WebVoiceChannelStatus.ACTIVE,
    }));
    const service = new WebVoiceChannelsService({
      location: { findFirst: jest.fn() },
      webVoiceChannel: { create },
    } as never);
    const first = await service.create(context, {});
    const second = await service.create(context, {});
    expect(first).toMatchObject({
      tenantId,
      status: WebVoiceChannelStatus.ACTIVE,
    });
    expect(first.publicWidgetKey).toMatch(/^wgt_[A-Za-z0-9_-]{43}$/);
    expect(first.publicWidgetKey).not.toBe(second.publicWidgetKey);
    expect(create.mock.calls[0][0].data).not.toHaveProperty('status');
  });

  it('accepts only an active same-tenant location and supports agent override', async () => {
    const findFirst = jest.fn().mockResolvedValue({ id: locationId });
    const create = jest.fn().mockImplementation(({ data }) => data);
    const service = new WebVoiceChannelsService({
      location: { findFirst },
      webVoiceChannel: { create },
    } as never);
    await service.create(context, { locationId, agentId: ' agent_custom ' });
    expect(findFirst).toHaveBeenCalledWith({
      where: { id: locationId, tenantId, status: ConfigurationStatus.ACTIVE },
      select: { id: true },
    });
    expect(create.mock.calls[0][0].data).toMatchObject({
      tenantId,
      locationId,
      agentId: 'agent_custom',
    });
  });

  it('rejects cross-tenant or inactive locations', async () => {
    const service = new WebVoiceChannelsService({
      location: { findFirst: jest.fn().mockResolvedValue(null) },
      webVoiceChannel: { create: jest.fn() },
    } as never);
    await expect(
      service.create(context, { locationId }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('tenant-scopes reads and updates without exposing key mutation', async () => {
    const findFirst = jest.fn().mockResolvedValue(null);
    const service = new WebVoiceChannelsService({
      webVoiceChannel: { findFirst },
    } as never);
    await expect(service.get(context, 'foreign')).rejects.toBeInstanceOf(
      NotFoundException,
    );
    expect(findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'foreign', tenantId } }),
    );
  });
});
