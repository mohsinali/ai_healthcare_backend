import {
  ConflictException,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { MembershipStatus, Prisma, TenantRole } from '@prisma/client';
import { PrismaService } from '../database/prisma.service';
import {
  AddMemberDto,
  CreateTenantDto,
  ListTenantsDto,
  UpdateMemberDto,
  UpdateTenantDto,
} from './dto/tenant.dto';

const tenantSelect = {
  id: true,
  name: true,
  slug: true,
  status: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.TenantSelect;
const memberInclude = {
  user: {
    select: {
      id: true,
      email: true,
      firstName: true,
      lastName: true,
      status: true,
    },
  },
} satisfies Prisma.TenantMembershipInclude;

@Injectable()
export class TenantsService {
  constructor(private readonly prisma: PrismaService) {}
  async create(dto: CreateTenantDto) {
    try {
      return await this.prisma.tenant.create({
        data: { name: dto.name.trim(), slug: dto.slug.trim().toLowerCase() },
        select: tenantSelect,
      });
    } catch (error) {
      this.handleUnique(error, 'A tenant with this slug already exists.');
      throw error;
    }
  }
  async list(query: ListTenantsDto) {
    const search = query.search?.trim();
    const where: Prisma.TenantWhereInput = {
      ...(query.status ? { status: query.status } : {}),
      ...(search
        ? {
            OR: [
              { name: { contains: search, mode: 'insensitive' } },
              { slug: { contains: search, mode: 'insensitive' } },
            ],
          }
        : {}),
    };
    const [field, direction] = query.sort.split(':') as [
      'createdAt' | 'name',
      'asc' | 'desc',
    ];
    const [data, total] = await this.prisma.$transaction([
      this.prisma.tenant.findMany({
        where,
        select: { ...tenantSelect, _count: { select: { memberships: true } } },
        orderBy: [{ [field]: direction }, { id: 'asc' }],
        skip: (query.page - 1) * query.limit,
        take: query.limit,
      }),
      this.prisma.tenant.count({ where }),
    ]);
    return {
      data: data.map(({ _count, ...tenant }) => ({
        ...tenant,
        memberCount: _count.memberships,
      })),
      meta: {
        page: query.page,
        limit: query.limit,
        total,
        totalPages: Math.ceil(total / query.limit),
      },
    };
  }
  async get(id: string) {
    const tenant = await this.prisma.tenant.findUnique({
      where: { id },
      select: { ...tenantSelect, _count: { select: { memberships: true } } },
    });
    if (!tenant) throw new NotFoundException('Tenant not found.');
    const { _count, ...data } = tenant;
    return { ...data, memberCount: _count.memberships };
  }
  async update(id: string, dto: UpdateTenantDto) {
    await this.requireTenant(id);
    return this.prisma.tenant.update({
      where: { id },
      data: {
        ...(dto.name !== undefined ? { name: dto.name.trim() } : {}),
        ...(dto.status ? { status: dto.status } : {}),
      },
      select: tenantSelect,
    });
  }
  async listMembers(tenantId: string) {
    await this.requireTenant(tenantId);
    return this.prisma.tenantMembership.findMany({
      where: { tenantId },
      include: memberInclude,
      orderBy: [{ status: 'asc' }, { createdAt: 'asc' }],
    });
  }
  async addMember(tenantId: string, dto: AddMemberDto) {
    await this.requireTenant(tenantId);
    const user = await this.prisma.user.findUnique({
      where: { id: dto.userId },
      select: { id: true },
    });
    if (!user) throw new NotFoundException('User not found.');
    try {
      return await this.prisma.tenantMembership.create({
        data: { tenantId, userId: dto.userId, role: dto.role },
        include: memberInclude,
      });
    } catch (error) {
      this.handleUnique(error, 'This user is already a member of the tenant.');
      throw error;
    }
  }
  async updateMember(
    tenantId: string,
    membershipId: string,
    dto: UpdateMemberDto,
  ) {
    const membership = await this.requireMembership(tenantId, membershipId);
    const removesActiveOwner =
      membership.role === TenantRole.CLINIC_OWNER &&
      membership.status === MembershipStatus.ACTIVE &&
      ((dto.role && dto.role !== TenantRole.CLINIC_OWNER) ||
        (dto.status && dto.status !== MembershipStatus.ACTIVE));
    if (removesActiveOwner)
      await this.assertAnotherOwner(tenantId, membershipId);
    return this.prisma.tenantMembership.update({
      where: { id: membershipId },
      data: dto,
      include: memberInclude,
    });
  }
  async deactivateMember(tenantId: string, membershipId: string) {
    return this.updateMember(tenantId, membershipId, {
      status: MembershipStatus.DISABLED,
    });
  }
  private async requireTenant(id: string) {
    if (
      !(await this.prisma.tenant.findUnique({
        where: { id },
        select: { id: true },
      }))
    )
      throw new NotFoundException('Tenant not found.');
  }
  private async requireMembership(tenantId: string, id: string) {
    const value = await this.prisma.tenantMembership.findFirst({
      where: { id, tenantId },
    });
    if (!value) throw new NotFoundException('Membership not found.');
    return value;
  }
  private async assertAnotherOwner(tenantId: string, excludeId: string) {
    const count = await this.prisma.tenantMembership.count({
      where: {
        tenantId,
        id: { not: excludeId },
        role: TenantRole.CLINIC_OWNER,
        status: MembershipStatus.ACTIVE,
      },
    });
    if (!count)
      throw new UnprocessableEntityException(
        'The final active Clinic Owner cannot be deactivated or reassigned.',
      );
  }
  private handleUnique(error: unknown, message: string): void {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === 'P2002'
    )
      throw new ConflictException(message);
  }
}
