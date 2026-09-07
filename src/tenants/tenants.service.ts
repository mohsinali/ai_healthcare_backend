import {
  ConflictException,
  BadRequestException,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { MembershipStatus, Prisma, TenantRole } from '@prisma/client';
import { AuthService } from '../auth/auth.service';
import { normalizeEmail } from '../users/users.service';
import { PrismaService } from '../database/prisma.service';
import {
  AddMemberDto,
  ConfirmExistingMemberDto,
  CreateTenantDto,
  ListTenantsDto,
  UpdateMemberDto,
  UpdateTenantDto,
} from './dto/tenant.dto';
import { TenantProvisioningService } from './tenant-provisioning.service';

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
  constructor(
    private readonly prisma: PrismaService,
    private readonly provisioning: TenantProvisioningService,
    private readonly auth: AuthService,
  ) {}
  async create(dto: CreateTenantDto) {
    for (let attempt = 0; attempt < 3; attempt += 1) {
      try {
        return await this.prisma.$transaction(async (tx) => {
          const tenant = await tx.tenant.create({
            data: {
              name: dto.name.trim(),
              slug: dto.slug.trim().toLowerCase(),
            },
            select: tenantSelect,
          });
          const provisioning = await this.provisioning.ensure(tenant.id, tx);
          return { ...tenant, provisioning };
        });
      } catch (error) {
        if (this.isWidgetKeyConflict(error)) {
          if (attempt < 2) continue;
          throw new ConflictException(
            'Unable to allocate a unique widget key.',
          );
        }
        this.handleUnique(error, 'A tenant with this slug already exists.');
        throw error;
      }
    }
    throw new ConflictException('Unable to allocate a unique widget key.');
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
    const provisioning = await this.provisioning.status(id);
    return { ...data, memberCount: _count.memberships, provisioning };
  }
  async repairProvisioning(id: string) {
    await this.requireTenant(id);
    for (let attempt = 0; attempt < 3; attempt += 1) {
      try {
        return await this.prisma.$transaction((tx) =>
          this.provisioning.ensure(id, tx),
        );
      } catch (error) {
        if (this.isProvisioningConflict(error)) {
          const existing = await this.provisioning.status(id);
          if (existing) return existing;
        }
        if (this.isWidgetKeyConflict(error) && attempt < 2) continue;
        throw error;
      }
    }
    throw new ConflictException('Unable to allocate a unique widget key.');
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
    const email = normalizeEmail(dto.email);
    const existing = await this.prisma.user.findUnique({
      where: { email },
      select: { id: true },
    });
    if (existing) {
      const membership = await this.prisma.tenantMembership.findUnique({
        where: { tenantId_userId: { tenantId, userId: existing.id } },
        select: { id: true },
      });
      if (membership)
        throw new ConflictException(
          'This account is already a member of this tenant.',
        );
      return {
        state: 'confirmation_required' as const,
        message:
          'This email belongs to an existing CareFlow account. Confirm that you want to add the account to this tenant. The account’s profile and password will not be changed.',
      };
    }
    if (!dto.firstName?.trim() || !dto.lastName?.trim())
      throw new BadRequestException(
        'First name and last name are required for a new account.',
      );
    if (!dto.temporaryPassword)
      throw new BadRequestException(
        'Temporary password is required for a new account.',
      );
    const passwordHash = await this.auth.hashPassword(dto.temporaryPassword);
    try {
      const member = await this.prisma.$transaction(async (tx) => {
        const user = await tx.user.create({
          data: {
            email,
            firstName: dto.firstName!.trim(),
            lastName: dto.lastName!.trim(),
            passwordHash,
          },
          select: { id: true },
        });
        return tx.tenantMembership.create({
          data: { tenantId, userId: user.id, role: dto.role },
          include: memberInclude,
        });
      });
      return { state: 'created' as const, member };
    } catch (error) {
      this.handleUnique(
        error,
        'This email was registered concurrently. Submit again to confirm adding the existing account.',
      );
      throw error;
    }
  }
  async confirmExistingMember(tenantId: string, dto: ConfirmExistingMemberDto) {
    await this.requireTenant(tenantId);
    const user = await this.prisma.user.findUnique({
      where: { email: normalizeEmail(dto.email) },
      select: { id: true },
    });
    if (!user)
      throw new ConflictException(
        'This account no longer exists. Submit the create-member form again.',
      );
    try {
      return await this.prisma.tenantMembership.create({
        data: { tenantId, userId: user.id, role: dto.role },
        include: memberInclude,
      });
    } catch (error) {
      this.handleUnique(
        error,
        'This account is already a member of this tenant.',
      );
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
  private isWidgetKeyConflict(error: unknown): boolean {
    if (
      !(error instanceof Prisma.PrismaClientKnownRequestError) ||
      error.code !== 'P2002'
    )
      return false;
    const target = error.meta?.target;
    return Array.isArray(target) && target.includes('publicWidgetKey');
  }
  private isProvisioningConflict(error: unknown): boolean {
    if (
      !(error instanceof Prisma.PrismaClientKnownRequestError) ||
      error.code !== 'P2002'
    )
      return false;
    const target = error.meta?.target;
    return Array.isArray(target) && target.includes('provisioningKey');
  }
}
