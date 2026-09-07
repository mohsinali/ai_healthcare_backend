import { Injectable } from '@nestjs/common';
import {
  ConfigurationStatus,
  Prisma,
  WebVoiceChannelStatus,
} from '@prisma/client';
import { PrismaService } from '../database/prisma.service';
import { generateWidgetKey } from '../web-voice/widget-key';

export const INITIAL_WEB_CHANNEL = 'INITIAL_WEB_CHANNEL';

type Db = Prisma.TransactionClient | PrismaService;

export interface ProvisioningSummary {
  baselineComplete: boolean;
  createdWebVoiceChannel: boolean;
  webVoiceChannelId: string;
  webVoiceChannelStatus: WebVoiceChannelStatus;
  readiness: {
    state:
      | 'CLINIC_SETUP_INCOMPLETE'
      | 'VOICE_CONFIGURATION_INCOMPLETE'
      | 'READY_TO_ACTIVATE'
      | 'ACTIVE';
    required: Array<{ key: string; complete: boolean; label: string }>;
    recommended: Array<{ key: string; complete: boolean; label: string }>;
  };
}

@Injectable()
export class TenantProvisioningService {
  constructor(private readonly prisma: PrismaService) {}

  async ensure(
    tenantId: string,
    db: Db = this.prisma,
  ): Promise<ProvisioningSummary> {
    let channel = await db.webVoiceChannel.findFirst({
      where: { tenantId, provisioningKey: INITIAL_WEB_CHANNEL },
      select: {
        id: true,
        locationId: true,
        publicWidgetKey: true,
        allowedOrigins: true,
        status: true,
      },
    });
    channel ??= await db.webVoiceChannel.findFirst({
      where: { tenantId },
      orderBy: { createdAt: 'asc' },
      select: {
        id: true,
        locationId: true,
        publicWidgetKey: true,
        allowedOrigins: true,
        status: true,
      },
    });
    let createdWebVoiceChannel = false;
    if (!channel) {
      channel = await db.webVoiceChannel.create({
        data: {
          tenantId,
          provisioningKey: INITIAL_WEB_CHANNEL,
          publicWidgetKey: generateWidgetKey(),
          allowedOrigins: [],
          status: WebVoiceChannelStatus.INACTIVE,
        },
        select: {
          id: true,
          locationId: true,
          publicWidgetKey: true,
          allowedOrigins: true,
          status: true,
        },
      });
      createdWebVoiceChannel = true;
    }
    return this.summary(tenantId, channel, createdWebVoiceChannel, db);
  }

  async status(
    tenantId: string,
    db: Db = this.prisma,
  ): Promise<ProvisioningSummary | null> {
    let channel = await db.webVoiceChannel.findFirst({
      where: { tenantId, provisioningKey: INITIAL_WEB_CHANNEL },
      select: {
        id: true,
        locationId: true,
        publicWidgetKey: true,
        allowedOrigins: true,
        status: true,
      },
    });
    channel ??= await db.webVoiceChannel.findFirst({
      where: { tenantId },
      orderBy: { createdAt: 'asc' },
      select: {
        id: true,
        locationId: true,
        publicWidgetKey: true,
        allowedOrigins: true,
        status: true,
      },
    });
    return channel ? this.summary(tenantId, channel, false, db) : null;
  }

  private async summary(
    tenantId: string,
    channel: {
      id: string;
      locationId: string | null;
      publicWidgetKey: string;
      allowedOrigins: string[];
      status: WebVoiceChannelStatus;
    },
    createdWebVoiceChannel: boolean,
    db: Db,
  ): Promise<ProvisioningSummary> {
    const [locations, hours, services, providers] = await Promise.all([
      db.location.count({
        where: { tenantId, status: ConfigurationStatus.ACTIVE },
      }),
      db.businessHour.count({ where: { tenantId } }),
      db.service.count({
        where: { tenantId, status: ConfigurationStatus.ACTIVE },
      }),
      db.provider.count({
        where: { tenantId, status: ConfigurationStatus.ACTIVE },
      }),
    ]);
    const required = [
      {
        key: 'location',
        complete: locations > 0,
        label: 'Create an active clinic location',
      },
      {
        key: 'channelLocation',
        complete: Boolean(channel.locationId),
        label: 'Associate the Voice Assistant with a location',
      },
      {
        key: 'allowedOrigins',
        complete: channel.allowedOrigins.length > 0,
        label: 'Add an allowed website origin',
      },
      {
        key: 'widgetKey',
        complete: Boolean(channel.publicWidgetKey),
        label: 'Generate a public widget key',
      },
    ];
    const recommended = [
      {
        key: 'businessHours',
        complete: hours > 0,
        label: 'Configure business hours',
      },
      { key: 'services', complete: services > 0, label: 'Add services' },
      { key: 'providers', complete: providers > 0, label: 'Add providers' },
    ];
    const configured = required.every((item) => item.complete);
    const state = !locations
      ? 'CLINIC_SETUP_INCOMPLETE'
      : !configured
        ? 'VOICE_CONFIGURATION_INCOMPLETE'
        : channel.status === WebVoiceChannelStatus.ACTIVE
          ? 'ACTIVE'
          : 'READY_TO_ACTIVATE';
    return {
      baselineComplete: true,
      createdWebVoiceChannel,
      webVoiceChannelId: channel.id,
      webVoiceChannelStatus: channel.status,
      readiness: { state, required, recommended },
    };
  }
}
