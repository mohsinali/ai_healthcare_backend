import { randomBytes } from 'node:crypto';
import { Injectable, NotFoundException } from '@nestjs/common';
import {
  ConfigurationStatus,
  Prisma,
  WebVoiceChannelStatus,
} from '@prisma/client';
import { optionalText } from '../clinic-config/clinic-config.helpers';
import { PrismaService } from '../database/prisma.service';
import { TrustedTenantContext } from '../tenants/types/tenant-context';
import {
  CreateWebVoiceChannelDto,
  ListWebVoiceChannelsDto,
  UpdateWebVoiceChannelDto,
} from './dto/web-voice-channel.dto';

const select = {
  id: true,
  locationId: true,
  location: {
    select: { id: true, locationNumber: true, name: true, status: true },
  },
  publicWidgetKey: true,
  agentId: true,
  status: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.WebVoiceChannelSelect;

@Injectable()
export class WebVoiceChannelsService {
  constructor(private readonly prisma: PrismaService) {}

  private async assertActiveLocation(
    tenantId: string,
    locationId?: string | null,
  ) {
    if (!locationId) return;
    const location = await this.prisma.location.findFirst({
      where: { id: locationId, tenantId, status: ConfigurationStatus.ACTIVE },
      select: { id: true },
    });
    if (!location) throw new NotFoundException('Active location not found.');
  }

  private mutableData(
    dto: CreateWebVoiceChannelDto | UpdateWebVoiceChannelDto,
  ) {
    return {
      ...(dto.locationId !== undefined ? { locationId: dto.locationId } : {}),
      ...(dto.agentId !== undefined
        ? { agentId: optionalText(dto.agentId) }
        : {}),
    };
  }

  async create(context: TrustedTenantContext, dto: CreateWebVoiceChannelDto) {
    await this.assertActiveLocation(context.tenantId, dto.locationId);
    return this.prisma.webVoiceChannel.create({
      data: {
        ...this.mutableData(dto),
        tenantId: context.tenantId,
        publicWidgetKey: `wgt_${randomBytes(32).toString('base64url')}`,
      },
      select,
    });
  }

  async list(context: TrustedTenantContext, query: ListWebVoiceChannelsDto) {
    const where: Prisma.WebVoiceChannelWhereInput = {
      tenantId: context.tenantId,
      ...(query.status ? { status: query.status } : {}),
      ...(query.locationId ? { locationId: query.locationId } : {}),
    };
    const [data, total] = await this.prisma.$transaction([
      this.prisma.webVoiceChannel.findMany({
        where,
        select,
        orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }],
        skip: (query.page - 1) * query.limit,
        take: query.limit,
      }),
      this.prisma.webVoiceChannel.count({ where }),
    ]);
    return {
      data,
      meta: {
        page: query.page,
        limit: query.limit,
        total,
        totalPages: Math.ceil(total / query.limit),
      },
    };
  }

  async get(context: TrustedTenantContext, id: string) {
    const channel = await this.prisma.webVoiceChannel.findFirst({
      where: { id, tenantId: context.tenantId },
      select,
    });
    if (!channel) throw new NotFoundException('Web voice channel not found.');
    return channel;
  }

  async update(
    context: TrustedTenantContext,
    id: string,
    dto: UpdateWebVoiceChannelDto,
  ) {
    await this.get(context, id);
    await this.assertActiveLocation(context.tenantId, dto.locationId);
    return this.prisma.webVoiceChannel.update({
      where: { tenantId_id: { tenantId: context.tenantId, id } },
      data: this.mutableData(dto),
      select,
    });
  }

  async status(
    context: TrustedTenantContext,
    id: string,
    status: WebVoiceChannelStatus,
  ) {
    await this.get(context, id);
    return this.prisma.webVoiceChannel.update({
      where: { tenantId_id: { tenantId: context.tenantId, id } },
      data: { status },
      select,
    });
  }
}
