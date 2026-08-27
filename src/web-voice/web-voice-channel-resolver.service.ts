import { Injectable } from '@nestjs/common';
import {
  ConfigurationStatus,
  TenantStatus,
  WebVoiceChannelStatus,
} from '@prisma/client';
import { PrismaService } from '../database/prisma.service';
import {
  VoiceChannel,
  WebWidgetVoiceContext,
} from '../voice/context/voice-context';
import { WIDGET_KEY_PATTERN } from './dto/create-web-voice-session.dto';

@Injectable()
export class WebVoiceChannelResolverService {
  constructor(private readonly prisma: PrismaService) {}

  async resolve(
    publicWidgetKey: string,
  ): Promise<WebWidgetVoiceContext | null> {
    if (!WIDGET_KEY_PATTERN.test(publicWidgetKey)) return null;
    const mapping = await this.prisma.webVoiceChannel.findUnique({
      where: { publicWidgetKey },
      include: {
        tenant: {
          select: { id: true, name: true, timezone: true, status: true },
        },
        location: {
          select: {
            id: true,
            name: true,
            status: true,
            timezone: true,
            escalationPhoneNumber: true,
          },
        },
      },
    });
    if (
      !mapping ||
      mapping.status !== WebVoiceChannelStatus.ACTIVE ||
      mapping.tenant.status !== TenantStatus.ACTIVE ||
      (mapping.location &&
        mapping.location.status !== ConfigurationStatus.ACTIVE)
    )
      return null;

    let location = mapping.location;
    if (!location) {
      const activeLocations = await this.prisma.location.findMany({
        where: {
          tenantId: mapping.tenantId,
          status: ConfigurationStatus.ACTIVE,
        },
        select: {
          id: true,
          name: true,
          status: true,
          timezone: true,
          escalationPhoneNumber: true,
        },
        take: 2,
        orderBy: { id: 'asc' },
      });
      // Zero or multiple active locations remain explicitly tenant-wide.
      location = activeLocations.length === 1 ? activeLocations[0] : null;
    }

    return {
      channel: VoiceChannel.WEB_WIDGET,
      webVoiceChannelId: mapping.id,
      agentId: mapping.agentId,
      tenantId: mapping.tenant.id,
      tenantName: mapping.tenant.name,
      locationId: location?.id ?? null,
      locationName: location?.name ?? null,
      timezone: location?.timezone ?? mapping.tenant.timezone,
      escalationPhoneNumber: location?.escalationPhoneNumber ?? null,
    };
  }
}
