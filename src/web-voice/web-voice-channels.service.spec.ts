import {
  BadRequestException,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
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

  it('canonicalizes, deduplicates, and sorts allowed origins on create', async () => {
    const create = jest.fn().mockImplementation(({ data }) => data);
    const service = new WebVoiceChannelsService({
      location: { findFirst: jest.fn() },
      webVoiceChannel: { create },
    } as never);
    await service.create(context, {
      allowedOrigins: [
        'https://B.example:443/',
        ' http://localhost:3001/ ',
        'https://b.example',
      ],
    });
    expect(create.mock.calls[0][0].data.allowedOrigins).toEqual([
      'http://localhost:3001',
      'https://b.example',
    ]);
  });

  it('rejects an invalid origin without persisting the channel', async () => {
    const create = jest.fn();
    const service = new WebVoiceChannelsService({
      location: { findFirst: jest.fn() },
      webVoiceChannel: { create },
    } as never);
    await expect(
      service.create(context, { allowedOrigins: ['https://example.com/path'] }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(create).not.toHaveBeenCalled();
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

  it('lists only active locations from the explicit tenant context', async () => {
    const findMany = jest.fn().mockResolvedValue([]);
    const count = jest.fn().mockResolvedValue(0);
    const service = new WebVoiceChannelsService({
      location: { findMany, count },
      $transaction: jest
        .fn()
        .mockImplementation((operations) => Promise.all(operations)),
    } as never);
    await service.listActiveLocations(context, { page: 1, limit: 100 });
    const where = {
      tenantId,
      status: ConfigurationStatus.ACTIVE,
    };
    expect(findMany).toHaveBeenCalledWith(expect.objectContaining({ where }));
    expect(count).toHaveBeenCalledWith({ where });
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

  it('preserves allowed origins when updating unrelated fields', async () => {
    const update = jest.fn().mockImplementation(({ data }) => data);
    const service = new WebVoiceChannelsService({
      location: { findFirst: jest.fn() },
      webVoiceChannel: {
        findFirst: jest.fn().mockResolvedValue({ id: 'channel-a' }),
        update,
      },
    } as never);
    await service.update(context, 'channel-a', { agentId: 'agent_new' });
    expect(update.mock.calls[0][0].data).toEqual({ agentId: 'agent_new' });
    expect(update.mock.calls[0][0].where).toEqual({
      tenantId_id: { tenantId, id: 'channel-a' },
    });
  });

  it('prevents activation until location and origins are configured', async () => {
    const update = jest.fn();
    const service = new WebVoiceChannelsService({
      webVoiceChannel: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'channel-a',
          locationId: null,
          allowedOrigins: [],
          status: WebVoiceChannelStatus.INACTIVE,
        }),
        update,
      },
    } as never);
    await expect(
      service.status(context, 'channel-a', WebVoiceChannelStatus.ACTIVE),
    ).rejects.toBeInstanceOf(UnprocessableEntityException);
    expect(update).not.toHaveBeenCalled();
  });
});
