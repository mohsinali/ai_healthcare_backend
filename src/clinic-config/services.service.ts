import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, SequenceType } from '@prisma/client';
import { PrismaService } from '../database/prisma.service';
import { SequenceService } from '../sequences/sequence.service';
import { TrustedTenantContext as TenantContext } from '../tenants/types/tenant-context';
import {
  CreateServiceDto,
  EditServiceDto,
  ListConfigurationDto,
  ReplaceAssignmentsDto,
  UpdateServiceDto,
} from './dto/clinic-config.dto';
import { normalizedName, optionalText } from './clinic-config.helpers';
@Injectable()
export class ServicesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly sequences: SequenceService,
  ) {}
  async create(ctx: TenantContext, dto: CreateServiceDto) {
    try {
      const data = this.data(dto);
      const { formatted: serviceNumber } = await this.sequences.next(
        ctx.tenantId,
        SequenceType.SERVICE,
      );
      return await this.prisma.service.create({
        data: { ...data, tenantId: ctx.tenantId, serviceNumber },
      });
    } catch (e) {
      this.unique(e);
      throw e;
    }
  }
  async list(ctx: TenantContext, q: ListConfigurationDto) {
    const search = q.search?.trim();
    const where: Prisma.ServiceWhereInput = {
      tenantId: ctx.tenantId,
      ...(q.status ? { status: q.status } : {}),
      ...(search
        ? {
            OR: [
              { serviceNumber: { contains: search, mode: 'insensitive' } },
              { name: { contains: search, mode: 'insensitive' } },
            ],
          }
        : {}),
    };
    const [data, total] = await this.prisma.$transaction([
      this.prisma.service.findMany({
        where,
        include: {
          _count: {
            select: { providerServices: true, locationServices: true },
          },
        },
        orderBy: { name: 'asc' },
        skip: (q.page - 1) * q.limit,
        take: q.limit,
      }),
      this.prisma.service.count({ where }),
    ]);
    return {
      data: data.map(({ _count, ...x }) => ({
        ...x,
        providerCount: _count.providerServices,
        locationCount: _count.locationServices,
      })),
      meta: {
        page: q.page,
        limit: q.limit,
        total,
        totalPages: Math.ceil(total / q.limit),
      },
    };
  }
  async get(ctx: TenantContext, id: string) {
    const value = await this.prisma.service.findFirst({
      where: { id, tenantId: ctx.tenantId },
      include: {
        providerServices: { include: { provider: true } },
        locationServices: { include: { location: true } },
      },
    });
    if (!value) throw new NotFoundException('Service not found.');
    return {
      ...value,
      providers: value.providerServices.map((x) => x.provider),
      locations: value.locationServices.map((x) => x.location),
      providerServices: undefined,
      locationServices: undefined,
    };
  }
  async update(ctx: TenantContext, id: string, dto: UpdateServiceDto) {
    await this.get(ctx, id);
    try {
      return await this.prisma.service.update({
        where: { id },
        data: this.data(dto),
      });
    } catch (e) {
      this.unique(e);
      throw e;
    }
  }
  async edit(ctx: TenantContext, id: string, dto: EditServiceDto) {
    await this.get(ctx, id);
    const [locations, providers] = await Promise.all([
      this.prisma.location.count({
        where: { tenantId: ctx.tenantId, id: { in: dto.locationIds } },
      }),
      this.prisma.provider.count({
        where: { tenantId: ctx.tenantId, id: { in: dto.providerIds } },
      }),
    ]);
    if (locations !== dto.locationIds.length)
      throw new NotFoundException('One or more locations were not found.');
    if (providers !== dto.providerIds.length)
      throw new NotFoundException('One or more providers were not found.');
    const { locationIds, providerIds, ...service } = dto;
    try {
      await this.prisma.$transaction(async (tx) => {
        await tx.service.update({ where: { id }, data: this.data(service) });
        await tx.locationService.deleteMany({
          where: { tenantId: ctx.tenantId, serviceId: id },
        });
        await tx.locationService.createMany({
          data: locationIds.map((locationId) => ({
            tenantId: ctx.tenantId,
            serviceId: id,
            locationId,
          })),
        });
        await tx.providerService.deleteMany({
          where: { tenantId: ctx.tenantId, serviceId: id },
        });
        await tx.providerService.createMany({
          data: providerIds.map((providerId) => ({
            tenantId: ctx.tenantId,
            serviceId: id,
            providerId,
          })),
        });
      });
      return this.get(ctx, id);
    } catch (error) {
      this.unique(error);
      throw error;
    }
  }
  providers(ctx: TenantContext, id: string) {
    return this.related(ctx, id, 'provider');
  }
  locations(ctx: TenantContext, id: string) {
    return this.related(ctx, id, 'location');
  }
  replaceProviders(ctx: TenantContext, id: string, dto: ReplaceAssignmentsDto) {
    return this.replace(ctx, id, dto, 'provider');
  }
  replaceLocations(ctx: TenantContext, id: string, dto: ReplaceAssignmentsDto) {
    return this.replace(ctx, id, dto, 'location');
  }
  private async related(
    ctx: TenantContext,
    id: string,
    type: 'provider' | 'location',
  ) {
    await this.get(ctx, id);
    return type === 'provider'
      ? this.prisma.provider.findMany({
          where: {
            tenantId: ctx.tenantId,
            providerServices: { some: { serviceId: id } },
          },
          orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
        })
      : this.prisma.location.findMany({
          where: {
            tenantId: ctx.tenantId,
            locationServices: { some: { serviceId: id } },
          },
          orderBy: { name: 'asc' },
        });
  }
  private async replace(
    ctx: TenantContext,
    id: string,
    dto: ReplaceAssignmentsDto,
    type: 'provider' | 'location',
  ) {
    await this.get(ctx, id);
    const count =
      type === 'provider'
        ? await this.prisma.provider.count({
            where: { tenantId: ctx.tenantId, id: { in: dto.ids } },
          })
        : await this.prisma.location.count({
            where: { tenantId: ctx.tenantId, id: { in: dto.ids } },
          });
    if (count !== dto.ids.length)
      throw new NotFoundException(`One or more ${type}s were not found.`);
    if (type === 'provider')
      await this.prisma.$transaction([
        this.prisma.providerService.deleteMany({
          where: { tenantId: ctx.tenantId, serviceId: id },
        }),
        this.prisma.providerService.createMany({
          data: dto.ids.map((providerId) => ({
            tenantId: ctx.tenantId,
            serviceId: id,
            providerId,
          })),
        }),
      ]);
    else
      await this.prisma.$transaction([
        this.prisma.locationService.deleteMany({
          where: { tenantId: ctx.tenantId, serviceId: id },
        }),
        this.prisma.locationService.createMany({
          data: dto.ids.map((locationId) => ({
            tenantId: ctx.tenantId,
            serviceId: id,
            locationId,
          })),
        }),
      ]);
    return this.related(ctx, id, type);
  }
  private data(
    dto: CreateServiceDto | UpdateServiceDto,
  ): Prisma.ServiceUncheckedCreateInput {
    const value: Record<string, unknown> = {};
    if (dto.name !== undefined) {
      value.name = dto.name.trim();
      value.normalizedName = normalizedName(dto.name);
    }
    if (dto.description !== undefined)
      value.description = optionalText(dto.description);
    if (dto.durationMinutes !== undefined)
      value.durationMinutes = dto.durationMinutes;
    if ('status' in dto && dto.status) value.status = dto.status;
    return value as Prisma.ServiceUncheckedCreateInput;
  }
  private unique(e: unknown) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002')
      throw new ConflictException('A service with this name already exists.');
  }
}
