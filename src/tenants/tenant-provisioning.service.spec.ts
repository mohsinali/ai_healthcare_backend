import { WebVoiceChannelStatus } from '@prisma/client';
import { PrismaService } from '../database/prisma.service';
import {
  INITIAL_WEB_CHANNEL,
  TenantProvisioningService,
} from './tenant-provisioning.service';

/* Prisma is intentionally replaced with Jest functions in this unit boundary. */
/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-return, @typescript-eslint/unbound-method */

describe('TenantProvisioningService', () => {
  const db = {
    webVoiceChannel: { findFirst: jest.fn(), create: jest.fn() },
    location: { count: jest.fn() },
    businessHour: { count: jest.fn() },
    service: { count: jest.fn() },
    provider: { count: jest.fn() },
  } as unknown as PrismaService;

  beforeEach(() => {
    jest.clearAllMocks();
    (db.location.count as jest.Mock).mockResolvedValue(0);
    (db.businessHour.count as jest.Mock).mockResolvedValue(0);
    (db.service.count as jest.Mock).mockResolvedValue(0);
    (db.provider.count as jest.Mock).mockResolvedValue(0);
  });

  it('creates the safe initial channel without fabricating a location', async () => {
    (db.webVoiceChannel.findFirst as jest.Mock)
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(null);
    (db.webVoiceChannel.create as jest.Mock).mockImplementation(({ data }) => ({
      ...data,
      id: 'channel-id',
      locationId: null,
    }));

    const result = await new TenantProvisioningService(db).ensure('tenant-id');

    expect(db.webVoiceChannel.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          tenantId: 'tenant-id',
          provisioningKey: INITIAL_WEB_CHANNEL,
          allowedOrigins: [],
          status: WebVoiceChannelStatus.INACTIVE,
          publicWidgetKey: expect.stringMatching(/^wgt_[A-Za-z0-9_-]{43}$/),
        }),
      }),
    );
    expect(result).toMatchObject({
      baselineComplete: true,
      createdWebVoiceChannel: true,
      webVoiceChannelStatus: WebVoiceChannelStatus.INACTIVE,
      readiness: { state: 'CLINIC_SETUP_INCOMPLETE' },
    });
  });

  it('repairs idempotently without changing an existing channel', async () => {
    const channel = {
      id: 'existing',
      locationId: 'location',
      publicWidgetKey: `wgt_${'a'.repeat(43)}`,
      allowedOrigins: ['https://clinic.example'],
      status: WebVoiceChannelStatus.ACTIVE,
    };
    (db.webVoiceChannel.findFirst as jest.Mock).mockResolvedValue(channel);
    (db.location.count as jest.Mock).mockResolvedValue(1);

    const result = await new TenantProvisioningService(db).ensure('tenant-id');

    expect(db.webVoiceChannel.create).not.toHaveBeenCalled();
    expect(result).toMatchObject({
      createdWebVoiceChannel: false,
      webVoiceChannelId: 'existing',
      webVoiceChannelStatus: WebVoiceChannelStatus.ACTIVE,
      readiness: { state: 'ACTIVE' },
    });
  });
});
