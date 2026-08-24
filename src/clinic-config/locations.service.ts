import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { DayOfWeek, Prisma } from '@prisma/client';
import { PrismaService } from '../database/prisma.service';
import { FieldValidationException } from '../common/validation/field-validation.exception';
import { TrustedTenantContext as TenantContext } from '../tenants/types/tenant-context';
import {
  CreateLocationDto,
  BusinessHourDto,
  EditLocationDto,
  ListConfigurationDto,
  ReplaceAssignmentsDto,
  UpdateBusinessHoursDto,
  UpdateLocationDto,
} from './dto/clinic-config.dto';
import {
  assertTimezone,
  normalizedName,
  optionalEmail,
  optionalText,
  phone,
} from './clinic-config.helpers';

const days = Object.values(DayOfWeek);
const locationInclude = {
  businessHours: { orderBy: { dayOfWeek: 'asc' as const } },
  _count: { select: { providerLocations: true, locationServices: true } },
};
const locationDetailInclude = {
  ...locationInclude,
  providerLocations: { include: { provider: true } },
  locationServices: { include: { service: true } },
};
@Injectable()
export class LocationsService {
  constructor(private readonly prisma: PrismaService) {}
  async create(ctx: TenantContext, dto: CreateLocationDto) {
    const data = this.data(dto, true) as Prisma.LocationUncheckedCreateInput;
    try {
      return await this.prisma.$transaction(async (tx) => {
        const location = await tx.location.create({
          data: { ...data, tenantId: ctx.tenantId },
          select: { id: true },
        });
        await tx.businessHour.createMany({
          data: days.map((day) => {
            const isClosed =
              day === DayOfWeek.SATURDAY || day === DayOfWeek.SUNDAY;
            return {
              tenantId: ctx.tenantId,
              locationId: location.id,
              dayOfWeek: day,
              isClosed,
              openTime: isClosed ? null : '09:00',
              closeTime: isClosed ? null : '17:00',
            };
          }),
        });
        return tx.location.findUniqueOrThrow({
          where: { id: location.id },
          include: locationInclude,
        });
      });
    } catch (error) {
      this.unique(error);
      throw error;
    }
  }
  async list(ctx: TenantContext, query: ListConfigurationDto) {
    const search = query.search?.trim();
    const where: Prisma.LocationWhereInput = {
      tenantId: ctx.tenantId,
      ...(query.status ? { status: query.status } : {}),
      ...(search
        ? {
            OR: [
              { name: { contains: search, mode: 'insensitive' } },
              { city: { contains: search, mode: 'insensitive' } },
            ],
          }
        : {}),
    };
    const [data, total] = await this.prisma.$transaction([
      this.prisma.location.findMany({
        where,
        include: {
          _count: {
            select: { providerLocations: true, locationServices: true },
          },
        },
        orderBy: [{ name: 'asc' }, { id: 'asc' }],
        skip: (query.page - 1) * query.limit,
        take: query.limit,
      }),
      this.prisma.location.count({ where }),
    ]);
    return {
      data: data.map((location) => this.withCounts(location)),
      meta: {
        page: query.page,
        limit: query.limit,
        total,
        totalPages: Math.ceil(total / query.limit),
      },
    };
  }
  async get(ctx: TenantContext, id: string) {
    const value = await this.prisma.location.findFirst({
      where: { id, tenantId: ctx.tenantId },
      include: locationDetailInclude,
    });
    if (!value) throw new NotFoundException('Location not found.');
    const { providerLocations, locationServices, ...location } = value;
    return {
      ...this.withCounts(location),
      providers: providerLocations.map((item) => item.provider),
      services: locationServices.map((item) => item.service),
    };
  }
  async update(ctx: TenantContext, id: string, dto: UpdateLocationDto) {
    await this.get(ctx, id);
    try {
      return await this.prisma.location.update({
        where: { id },
        data: this.data(dto, false),
        include: locationInclude,
      });
    } catch (error) {
      this.unique(error);
      throw error;
    }
  }
  async edit(ctx: TenantContext, id: string, dto: EditLocationDto) {
    await this.get(ctx, id);
    this.validateHours(dto.businessHours);
    const found = await this.prisma.service.count({
      where: { tenantId: ctx.tenantId, id: { in: dto.serviceIds } },
    });
    if (found !== dto.serviceIds.length)
      throw new NotFoundException('One or more services were not found.');
    const { businessHours, serviceIds, ...location } = dto;
    try {
      await this.prisma.$transaction(async (tx) => {
        await tx.location.update({
          where: { id },
          data: this.data(location, false),
        });
        for (const hour of businessHours)
          await tx.businessHour.update({
            where: {
              locationId_dayOfWeek: {
                locationId: id,
                dayOfWeek: hour.dayOfWeek,
              },
            },
            data: {
              isClosed: hour.isClosed,
              openTime: hour.isClosed ? null : hour.openTime,
              closeTime: hour.isClosed ? null : hour.closeTime,
            },
          });
        await tx.locationService.deleteMany({
          where: { tenantId: ctx.tenantId, locationId: id },
        });
        await tx.locationService.createMany({
          data: serviceIds.map((serviceId) => ({
            tenantId: ctx.tenantId,
            locationId: id,
            serviceId,
          })),
        });
      });
      return this.get(ctx, id);
    } catch (error) {
      this.unique(error);
      throw error;
    }
  }
  async businessHours(ctx: TenantContext, id: string) {
    await this.get(ctx, id);
    return this.prisma.businessHour.findMany({
      where: { tenantId: ctx.tenantId, locationId: id },
      orderBy: { dayOfWeek: 'asc' },
    });
  }
  async updateBusinessHours(
    ctx: TenantContext,
    id: string,
    dto: UpdateBusinessHoursDto,
  ) {
    await this.get(ctx, id);
    this.validateHours(dto.hours);
    await this.prisma.$transaction(
      dto.hours.map((hour) =>
        this.prisma.businessHour.update({
          where: {
            locationId_dayOfWeek: { locationId: id, dayOfWeek: hour.dayOfWeek },
          },
          data: {
            isClosed: hour.isClosed,
            openTime: hour.isClosed ? null : hour.openTime,
            closeTime: hour.isClosed ? null : hour.closeTime,
          },
        }),
      ),
    );
    return this.businessHours(ctx, id);
  }
  private validateHours(hours: BusinessHourDto[]) {
    if (
      hours.length !== 7 ||
      days.some((day) => !hours.some((hour) => hour.dayOfWeek === day))
    )
      throw new BadRequestException(
        'Business hours must contain each weekday exactly once.',
      );
    hours.forEach((hour) => {
      if (hour.isClosed && (hour.openTime || hour.closeTime))
        throw new BadRequestException(
          `${hour.dayOfWeek}: closed days cannot include times.`,
        );
      if (!hour.isClosed && (!hour.openTime || !hour.closeTime))
        throw new BadRequestException(
          `${hour.dayOfWeek}: open and close times are required.`,
        );
      if (!hour.isClosed && hour.openTime! >= hour.closeTime!)
        throw new BadRequestException(
          `${hour.dayOfWeek}: opening time must be before closing time.`,
        );
    });
  }
  async services(ctx: TenantContext, id: string) {
    await this.get(ctx, id);
    return this.prisma.service.findMany({
      where: {
        tenantId: ctx.tenantId,
        locationServices: { some: { locationId: id } },
      },
      orderBy: { name: 'asc' },
    });
  }
  async replaceServices(
    ctx: TenantContext,
    id: string,
    dto: ReplaceAssignmentsDto,
  ) {
    await this.get(ctx, id);
    const found = await this.prisma.service.count({
      where: { tenantId: ctx.tenantId, id: { in: dto.ids } },
    });
    if (found !== dto.ids.length)
      throw new NotFoundException('One or more services were not found.');
    await this.prisma.$transaction([
      this.prisma.locationService.deleteMany({
        where: { tenantId: ctx.tenantId, locationId: id },
      }),
      this.prisma.locationService.createMany({
        data: dto.ids.map((serviceId) => ({
          tenantId: ctx.tenantId,
          locationId: id,
          serviceId,
        })),
      }),
    ]);
    return this.services(ctx, id);
  }
  private data(
    dto: UpdateLocationDto | CreateLocationDto,
    required: boolean,
  ): Prisma.LocationUncheckedCreateInput | Prisma.LocationUncheckedUpdateInput {
    const result: Record<string, unknown> = {};
    for (const key of [
      'name',
      'addressLine1',
      'addressLine2',
      'city',
      'stateProvince',
      'postalCode',
    ] as const)
      if (dto[key] !== undefined)
        result[key] =
          key === 'addressLine2' ? optionalText(dto[key]) : dto[key].trim();
    if (dto.name !== undefined)
      result.normalizedName = normalizedName(dto.name);
    if (dto.email !== undefined) result.email = optionalEmail(dto.email);
    if (dto.phone !== undefined || required)
      result.phone = this.locationPhone('phone', dto.phone, required);
    if (dto.escalationPhoneNumber !== undefined)
      result.escalationPhoneNumber = this.locationPhone(
        'escalationPhoneNumber',
        dto.escalationPhoneNumber,
      );
    if (dto.timezone !== undefined)
      result.timezone = assertTimezone(dto.timezone);
    if (dto.countryCode !== undefined)
      result.countryCode = dto.countryCode.toUpperCase();
    if ('status' in dto && dto.status) result.status = dto.status;
    return result;
  }
  private locationPhone(
    field: 'phone' | 'escalationPhoneNumber',
    value: string | null | undefined,
    required = false,
  ) {
    try {
      return phone(value, required);
    } catch (error) {
      if (error instanceof BadRequestException)
        throw new FieldValidationException([
          {
            field,
            message: 'Enter a valid international phone number.',
          },
        ]);
      throw error;
    }
  }
  private withCounts<
    T extends {
      _count: { providerLocations: number; locationServices: number };
    },
  >(value: T) {
    const { _count, ...rest } = value;
    return {
      ...rest,
      providerCount: _count.providerLocations,
      serviceCount: _count.locationServices,
    };
  }
  private unique(error: unknown) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === 'P2002'
    )
      throw new ConflictException('A location with this name already exists.');
  }
}
