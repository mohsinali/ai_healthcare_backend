import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../database/prisma.service';
import { TrustedTenantContext as TenantContext } from '../tenants/types/tenant-context';
import {
  CreateServiceDto,
  ListConfigurationDto,
  UpdateServiceDto,
} from './dto/clinic-config.dto';
import { normalizedName, optionalText } from './clinic-config.helpers';
@Injectable()
export class ServicesService {
  constructor(private readonly prisma: PrismaService) {}
  async create(ctx: TenantContext, dto: CreateServiceDto) {
    try {
      return await this.prisma.service.create({
        data: { ...this.data(dto), tenantId: ctx.tenantId },
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
      ...(search ? { name: { contains: search, mode: 'insensitive' } } : {}),
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
