import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../database/prisma.service';
import { TrustedTenantContext as TenantContext } from '../tenants/types/tenant-context';
import {
  CreateProviderDto,
  ListConfigurationDto,
  ReplaceAssignmentsDto,
  UpdateProviderDto,
} from './dto/clinic-config.dto';
import { optionalEmail, optionalText, phone } from './clinic-config.helpers';
@Injectable()
export class ProvidersService {
  constructor(private readonly prisma: PrismaService) {}
  create(ctx: TenantContext, dto: CreateProviderDto) {
    return this.prisma.provider.create({
      data: { ...this.data(dto), tenantId: ctx.tenantId },
    });
  }
  async list(ctx: TenantContext, query: ListConfigurationDto) {
    const search = query.search?.trim();
    const where: Prisma.ProviderWhereInput = {
      tenantId: ctx.tenantId,
      ...(query.status ? { status: query.status } : {}),
      ...(search
        ? {
            OR: ['firstName', 'lastName', 'displayName'].map((field) => ({
              [field]: { contains: search, mode: 'insensitive' },
            })),
          }
        : {}),
    };
    const [data, total] = await this.prisma.$transaction([
      this.prisma.provider.findMany({
        where,
        include: {
          _count: {
            select: { providerLocations: true, providerServices: true },
          },
        },
        orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
        skip: (query.page - 1) * query.limit,
        take: query.limit,
      }),
      this.prisma.provider.count({ where }),
    ]);
    return {
      data: data.map(({ _count, ...item }) => ({
        ...item,
        locationCount: _count.providerLocations,
        serviceCount: _count.providerServices,
      })),
      meta: {
        page: query.page,
        limit: query.limit,
        total,
        totalPages: Math.ceil(total / query.limit),
      },
    };
  }
  async get(ctx: TenantContext, id: string) {
    const value = await this.prisma.provider.findFirst({
      where: { id, tenantId: ctx.tenantId },
      include: {
        providerLocations: { include: { location: true } },
        providerServices: { include: { service: true } },
      },
    });
    if (!value) throw new NotFoundException('Provider not found.');
    return {
      ...value,
      locations: value.providerLocations.map((x) => x.location),
      services: value.providerServices.map((x) => x.service),
      providerLocations: undefined,
      providerServices: undefined,
    };
  }
  async update(ctx: TenantContext, id: string, dto: UpdateProviderDto) {
    await this.get(ctx, id);
    return this.prisma.provider.update({ where: { id }, data: this.data(dto) });
  }
  locations(ctx: TenantContext, id: string) {
    return this.related(ctx, id, 'location');
  }
  services(ctx: TenantContext, id: string) {
    return this.related(ctx, id, 'service');
  }
  replaceLocations(ctx: TenantContext, id: string, dto: ReplaceAssignmentsDto) {
    return this.replace(ctx, id, dto, 'location');
  }
  replaceServices(ctx: TenantContext, id: string, dto: ReplaceAssignmentsDto) {
    return this.replace(ctx, id, dto, 'service');
  }
  private async related(
    ctx: TenantContext,
    id: string,
    type: 'location' | 'service',
  ) {
    await this.get(ctx, id);
    return type === 'location'
      ? this.prisma.location.findMany({
          where: {
            tenantId: ctx.tenantId,
            providerLocations: { some: { providerId: id } },
          },
          orderBy: { name: 'asc' },
        })
      : this.prisma.service.findMany({
          where: {
            tenantId: ctx.tenantId,
            providerServices: { some: { providerId: id } },
          },
          orderBy: { name: 'asc' },
        });
  }
  private async replace(
    ctx: TenantContext,
    id: string,
    dto: ReplaceAssignmentsDto,
    type: 'location' | 'service',
  ) {
    await this.get(ctx, id);
    const count =
      type === 'location'
        ? await this.prisma.location.count({
            where: { tenantId: ctx.tenantId, id: { in: dto.ids } },
          })
        : await this.prisma.service.count({
            where: { tenantId: ctx.tenantId, id: { in: dto.ids } },
          });
    if (count !== dto.ids.length)
      throw new NotFoundException(`One or more ${type}s were not found.`);
    if (type === 'location')
      await this.prisma.$transaction([
        this.prisma.providerLocation.deleteMany({
          where: { tenantId: ctx.tenantId, providerId: id },
        }),
        this.prisma.providerLocation.createMany({
          data: dto.ids.map((locationId) => ({
            tenantId: ctx.tenantId,
            providerId: id,
            locationId,
          })),
        }),
      ]);
    else
      await this.prisma.$transaction([
        this.prisma.providerService.deleteMany({
          where: { tenantId: ctx.tenantId, providerId: id },
        }),
        this.prisma.providerService.createMany({
          data: dto.ids.map((serviceId) => ({
            tenantId: ctx.tenantId,
            providerId: id,
            serviceId,
          })),
        }),
      ]);
    return this.related(ctx, id, type);
  }
  private data(
    dto: CreateProviderDto | UpdateProviderDto,
  ): Prisma.ProviderUncheckedCreateInput {
    const value: Record<string, unknown> = {};
    for (const key of ['firstName', 'lastName'] as const)
      if (dto[key] !== undefined) value[key] = dto[key].trim();
    for (const key of ['displayName', 'title'] as const)
      if (dto[key] !== undefined) value[key] = optionalText(dto[key]);
    if (dto.email !== undefined) value.email = optionalEmail(dto.email);
    if (dto.phone !== undefined) value.phone = phone(dto.phone);
    if ('status' in dto && dto.status) value.status = dto.status;
    return value as Prisma.ProviderUncheckedCreateInput;
  }
}
