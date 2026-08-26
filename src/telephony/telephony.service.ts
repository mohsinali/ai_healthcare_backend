import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, TelephonyNumberStatus } from '@prisma/client';
import { phone, optionalText } from '../clinic-config/clinic-config.helpers';
import { PrismaService } from '../database/prisma.service';
import { TrustedTenantContext } from '../tenants/types/tenant-context';
import {
  CreateTelephonyNumberDto,
  ListTelephonyNumbersDto,
  UpdateTelephonyNumberDto,
} from './dto/telephony-number.dto';

const telephonyNumberSelect = {
  id: true,
  locationId: true,
  location: { select: { id: true, locationNumber: true, name: true } },
  phoneNumber: true,
  provider: true,
  providerPhoneNumberId: true,
  status: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.TelephonyNumberSelect;

@Injectable()
export class TelephonyService {
  constructor(private readonly prisma: PrismaService) {}

  private async assertLocation(
    tenantId: string,
    locationId: string | null | undefined,
  ) {
    if (!locationId) return;
    const exists = await this.prisma.location.findFirst({
      where: { id: locationId, tenantId },
      select: { id: true },
    });
    if (!exists) throw new NotFoundException('Location not found.');
  }

  private data(dto: CreateTelephonyNumberDto | UpdateTelephonyNumberDto) {
    return {
      ...(dto.locationId !== undefined ? { locationId: dto.locationId } : {}),
      ...(dto.phoneNumber !== undefined
        ? { phoneNumber: phone(dto.phoneNumber, true)! }
        : {}),
      ...(dto.provider !== undefined ? { provider: dto.provider } : {}),
      ...(dto.providerPhoneNumberId !== undefined
        ? { providerPhoneNumberId: optionalText(dto.providerPhoneNumberId) }
        : {}),
    };
  }

  private handleUnique(error: unknown): never {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === 'P2002'
    )
      throw new ConflictException('This phone number is already configured.');
    throw error;
  }

  async create(context: TrustedTenantContext, dto: CreateTelephonyNumberDto) {
    await this.assertLocation(context.tenantId, dto.locationId);
    try {
      return await this.prisma.telephonyNumber.create({
        data: {
          ...this.data(dto),
          tenantId: context.tenantId,
        } as Prisma.TelephonyNumberUncheckedCreateInput,
        select: telephonyNumberSelect,
      });
    } catch (error) {
      this.handleUnique(error);
    }
  }

  async list(context: TrustedTenantContext, query: ListTelephonyNumbersDto) {
    const search = query.search?.trim();
    const where: Prisma.TelephonyNumberWhereInput = {
      tenantId: context.tenantId,
      ...(query.status ? { status: query.status } : {}),
      ...(query.locationId ? { locationId: query.locationId } : {}),
      ...(search
        ? {
            OR: [
              { phoneNumber: { contains: search, mode: 'insensitive' } },
              {
                providerPhoneNumberId: {
                  contains: search,
                  mode: 'insensitive',
                },
              },
            ],
          }
        : {}),
    };
    const [data, total] = await this.prisma.$transaction([
      this.prisma.telephonyNumber.findMany({
        where,
        select: telephonyNumberSelect,
        orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }],
        skip: (query.page - 1) * query.limit,
        take: query.limit,
      }),
      this.prisma.telephonyNumber.count({ where }),
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
    const mapping = await this.prisma.telephonyNumber.findFirst({
      where: { id, tenantId: context.tenantId },
      select: telephonyNumberSelect,
    });
    if (!mapping) throw new NotFoundException('Telephony number not found.');
    return mapping;
  }

  async update(
    context: TrustedTenantContext,
    id: string,
    dto: UpdateTelephonyNumberDto,
  ) {
    await this.get(context, id);
    await this.assertLocation(context.tenantId, dto.locationId);
    try {
      return await this.prisma.telephonyNumber.update({
        where: { tenantId_id: { tenantId: context.tenantId, id } },
        data: this.data(dto),
        select: telephonyNumberSelect,
      });
    } catch (error) {
      this.handleUnique(error);
    }
  }

  async status(
    context: TrustedTenantContext,
    id: string,
    status: TelephonyNumberStatus,
  ) {
    await this.get(context, id);
    return this.prisma.telephonyNumber.update({
      where: { tenantId_id: { tenantId: context.tenantId, id } },
      data: { status },
      select: telephonyNumberSelect,
    });
  }
}
