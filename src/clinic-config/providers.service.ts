import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { DayOfWeek, Prisma, SequenceType } from '@prisma/client';
import { FieldValidationException } from '../common/validation/field-validation.exception';
import { PrismaService } from '../database/prisma.service';
import { SequenceService } from '../sequences/sequence.service';
import { TrustedTenantContext as TenantContext } from '../tenants/types/tenant-context';
import {
  CreateProviderDto,
  EditProviderDto,
  ListConfigurationDto,
  ReplaceAssignmentsDto,
  ReplaceProviderWorkingPeriodsDto,
  UpdateProviderDto,
} from './dto/clinic-config.dto';
import { optionalEmail, optionalText, phone } from './clinic-config.helpers';
import {
  findPeriodsOutsideLocationHours,
  findProviderPeriodOverlaps,
  lockLocationSchedule,
  scheduleConflictCodes,
  ScheduleInvariantException,
  sortSchedulePeriods,
} from './scheduling-invariants';

const weekdayOrder = new Map(
  Object.values(DayOfWeek).map((day, index) => [day, index]),
);
@Injectable()
export class ProvidersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly sequences: SequenceService,
  ) {}
  async create(ctx: TenantContext, dto: CreateProviderDto) {
    const data = this.data(dto);
    const { formatted: providerNumber } = await this.sequences.next(
      ctx.tenantId,
      SequenceType.PROVIDER,
    );
    return this.prisma.provider.create({
      data: { ...data, tenantId: ctx.tenantId, providerNumber },
    });
  }
  async list(ctx: TenantContext, query: ListConfigurationDto) {
    const search = query.search?.trim();
    const where: Prisma.ProviderWhereInput = {
      tenantId: ctx.tenantId,
      ...(query.status ? { status: query.status } : {}),
      ...(search
        ? {
            OR: ['firstName', 'lastName', 'displayName', 'title']
              .map((field) => ({
                [field]: { contains: search, mode: 'insensitive' },
              }))
              .concat({
                providerNumber: { contains: search, mode: 'insensitive' },
              }),
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
  async edit(ctx: TenantContext, id: string, dto: EditProviderDto) {
    await this.get(ctx, id);
    const [locations, services] = await Promise.all([
      this.prisma.location.count({
        where: { tenantId: ctx.tenantId, id: { in: dto.locationIds } },
      }),
      this.prisma.service.count({
        where: { tenantId: ctx.tenantId, id: { in: dto.serviceIds } },
      }),
    ]);
    if (locations !== dto.locationIds.length)
      throw new NotFoundException('One or more locations were not found.');
    if (services !== dto.serviceIds.length)
      throw new NotFoundException('One or more services were not found.');
    const { locationIds, serviceIds, ...provider } = dto;
    await this.prisma.$transaction(async (tx) => {
      await tx.provider.update({ where: { id }, data: this.data(provider) });
      await this.replaceLocationAssignments(tx, ctx.tenantId, id, locationIds);
      await tx.providerService.deleteMany({
        where: { tenantId: ctx.tenantId, providerId: id },
      });
      await tx.providerService.createMany({
        data: serviceIds.map((serviceId) => ({
          tenantId: ctx.tenantId,
          providerId: id,
          serviceId,
        })),
      });
    });
    return this.get(ctx, id);
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
  async workingPeriods(ctx: TenantContext, id: string) {
    const provider = await this.prisma.provider.findFirst({
      where: { id, tenantId: ctx.tenantId },
      select: { id: true },
    });
    if (!provider) throw new NotFoundException('Provider not found.');

    const assignments = await this.prisma.providerLocation.findMany({
      where: { tenantId: ctx.tenantId, providerId: id },
      select: {
        location: {
          select: {
            id: true,
            name: true,
            timezone: true,
            status: true,
            businessHours: {
              select: {
                dayOfWeek: true,
                isClosed: true,
                openTime: true,
                closeTime: true,
              },
            },
          },
        },
        providerWorkingPeriods: {
          select: {
            dayOfWeek: true,
            startTime: true,
            endTime: true,
            isActive: true,
          },
        },
      },
      orderBy: [{ location: { name: 'asc' } }, { locationId: 'asc' }],
    });

    return assignments.map(({ location, providerWorkingPeriods }) => ({
      ...location,
      businessHours: this.sortByWeekday(location.businessHours),
      periods: this.sortPeriods(providerWorkingPeriods),
    }));
  }
  async replaceWorkingPeriods(
    ctx: TenantContext,
    providerId: string,
    locationId: string,
    dto: ReplaceProviderWorkingPeriodsDto,
  ) {
    for (const period of dto.periods) {
      if (period.startTime >= period.endTime)
        throw new BadRequestException(
          'Working period startTime must be before endTime.',
        );
    }

    try {
      return await this.prisma.$transaction(async (tx) => {
        await lockLocationSchedule(tx, ctx.tenantId, locationId);
        const location = await this.assertProviderLocation(
          tx,
          ctx.tenantId,
          providerId,
          locationId,
        );
        const overlaps = findProviderPeriodOverlaps(dto.periods, locationId);
        if (overlaps.length)
          throw new ScheduleInvariantException(
            scheduleConflictCodes.overlap,
            overlaps,
          );
        const outsideHours = findPeriodsOutsideLocationHours(
          dto.periods,
          location.businessHours,
          locationId,
          location.status,
        );
        if (outsideHours.length)
          throw new ScheduleInvariantException(
            scheduleConflictCodes.outsideHours,
            outsideHours,
          );
        await tx.providerWorkingPeriod.deleteMany({
          where: { tenantId: ctx.tenantId, providerId, locationId },
        });
        if (dto.periods.length)
          await tx.providerWorkingPeriod.createMany({
            data: dto.periods.map((period) => ({
              tenantId: ctx.tenantId,
              providerId,
              locationId,
              dayOfWeek: period.dayOfWeek,
              startTime: period.startTime,
              endTime: period.endTime,
              isActive: period.isActive ?? true,
            })),
          });
        const stored = await tx.providerWorkingPeriod.findMany({
          where: { tenantId: ctx.tenantId, providerId, locationId },
          select: {
            dayOfWeek: true,
            startTime: true,
            endTime: true,
            isActive: true,
          },
        });
        return this.sortPeriods(stored);
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        (error.code === 'P2002' || error.code === 'P2004')
      )
        throw new BadRequestException('Working periods are invalid.');
      throw error;
    }
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
      await this.prisma.$transaction((tx) =>
        this.replaceLocationAssignments(tx, ctx.tenantId, id, dto.ids),
      );
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
  private async assertProviderLocation(
    tx: Prisma.TransactionClient,
    tenantId: string,
    providerId: string,
    locationId: string,
  ) {
    const provider = await tx.provider.findFirst({
      where: { id: providerId, tenantId },
      select: { id: true },
    });
    if (!provider) throw new NotFoundException('Provider not found.');
    const location = await tx.location.findFirst({
      where: { id: locationId, tenantId },
      select: {
        id: true,
        status: true,
        businessHours: {
          select: {
            dayOfWeek: true,
            isClosed: true,
            openTime: true,
            closeTime: true,
          },
        },
      },
    });
    if (!location) throw new NotFoundException('Location not found.');
    const assignment = await tx.providerLocation.findFirst({
      where: { tenantId, providerId, locationId },
      select: { id: true },
    });
    if (!assignment)
      throw new NotFoundException('Provider location assignment not found.');
    return location;
  }
  private async replaceLocationAssignments(
    tx: Prisma.TransactionClient,
    tenantId: string,
    providerId: string,
    locationIds: string[],
  ) {
    const existing = await tx.providerLocation.findMany({
      where: { tenantId, providerId },
      select: { locationId: true },
    });
    const requested = new Set(locationIds);
    const existingIds = new Set(existing.map(({ locationId }) => locationId));
    const removed = existing
      .map(({ locationId }) => locationId)
      .filter((locationId) => !requested.has(locationId));
    const added = locationIds.filter(
      (locationId) => !existingIds.has(locationId),
    );
    if (removed.length)
      await tx.providerLocation.deleteMany({
        where: { tenantId, providerId, locationId: { in: removed } },
      });
    if (added.length)
      await tx.providerLocation.createMany({
        data: added.map((locationId) => ({ tenantId, providerId, locationId })),
      });
  }
  private sortByWeekday<T extends { dayOfWeek: DayOfWeek }>(values: T[]) {
    return [...values].sort(
      (a, b) => weekdayOrder.get(a.dayOfWeek)! - weekdayOrder.get(b.dayOfWeek)!,
    );
  }
  private sortPeriods<
    T extends { dayOfWeek: DayOfWeek; startTime: string; endTime: string },
  >(periods: T[]) {
    return sortSchedulePeriods(periods);
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
    if (dto.phone !== undefined) value.phone = this.providerPhone(dto.phone);
    if ('status' in dto && dto.status) value.status = dto.status;
    return value as Prisma.ProviderUncheckedCreateInput;
  }
  private providerPhone(value: string | null | undefined) {
    try {
      return phone(value);
    } catch (error) {
      if (error instanceof BadRequestException)
        throw new FieldValidationException([
          {
            field: 'phone',
            message: 'Enter a valid international phone number.',
          },
        ]);
      throw error;
    }
  }
}
