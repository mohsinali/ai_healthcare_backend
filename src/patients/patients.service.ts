import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PatientStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../database/prisma.service';
import {
  normalizedName,
  optionalEmail,
  optionalText,
  phone,
} from '../clinic-config/clinic-config.helpers';
import { TrustedTenantContext } from '../tenants/types/tenant-context';
import { FieldValidationException } from '../common/validation/field-validation.exception';
import {
  CreatePatientDto,
  DuplicateCheckDto,
  ListPatientsDto,
  UpdatePatientDto,
} from './dto/patient.dto';
@Injectable()
export class PatientsService {
  constructor(private readonly prisma: PrismaService) {}
  private dob(value: string) {
    const date = new Date(`${value}T00:00:00.000Z`);
    if (
      Number.isNaN(date.valueOf()) ||
      date.toISOString().slice(0, 10) !== value
    )
      throw new FieldValidationException([
        { field: 'dateOfBirth', message: 'Enter a valid date of birth.' },
      ]);
    const today = new Date().toISOString().slice(0, 10);
    if (value > today)
      throw new FieldValidationException([
        {
          field: 'dateOfBirth',
          message: 'Date of birth cannot be in the future.',
        },
      ]);
    return date;
  }
  private data(
    dto: PatientInput,
    partial = false,
  ): Prisma.PatientUncheckedCreateInput | Prisma.PatientUncheckedUpdateInput {
    const required = (value: string | undefined, label: string) => {
      if (value === undefined && partial) return undefined;
      const text = value?.trim();
      if (!text) {
        const field = label === 'First name' ? 'firstName' : 'lastName';
        throw new FieldValidationException([
          { field, message: `${label} is required.` },
        ]);
      }
      return text;
    };
    const firstName = required(dto.firstName, 'First name');
    const lastName = required(dto.lastName, 'Last name');
    let normalizedPhone: string | null | undefined;
    try {
      normalizedPhone = phone(dto.phone, dto.phone !== undefined || !partial);
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
    return {
      firstName,
      ...(firstName !== undefined
        ? { normalizedFirstName: normalizedName(firstName) }
        : {}),
      middleName: optionalText(dto.middleName),
      lastName,
      ...(lastName !== undefined
        ? { normalizedLastName: normalizedName(lastName) }
        : {}),
      dateOfBirth:
        dto.dateOfBirth === undefined ? undefined : this.dob(dto.dateOfBirth),
      phone: normalizedPhone ?? undefined,
      email: optionalEmail(dto.email),
      addressLine1: optionalText(dto.addressLine1),
      addressLine2: optionalText(dto.addressLine2),
      city: optionalText(dto.city),
      stateProvince: optionalText(dto.stateProvince),
      postalCode: optionalText(dto.postalCode),
      countryCode:
        dto.countryCode === undefined
          ? undefined
          : optionalText(dto.countryCode)?.toUpperCase(),
      preferredContactMethod: dto.preferredContactMethod,
    };
  }
  async list(c: TrustedTenantContext, q: ListPatientsDto) {
    const search = q.search?.trim();
    const where: Prisma.PatientWhereInput = {
      tenantId: c.tenantId,
      ...(q.status ? { status: q.status } : {}),
      ...(q.dateOfBirth ? { dateOfBirth: this.dob(q.dateOfBirth) } : {}),
      ...(search
        ? {
            OR: [
              { firstName: { contains: search, mode: 'insensitive' } },
              { middleName: { contains: search, mode: 'insensitive' } },
              { lastName: { contains: search, mode: 'insensitive' } },
              { phone: { contains: search.replace(/[\s()-]/g, '') } },
              { email: { contains: search, mode: 'insensitive' } },
            ],
          }
        : {}),
    };
    const [data, total] = await this.prisma.$transaction([
      this.prisma.patient.findMany({
        where,
        orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }, { id: 'asc' }],
        skip: (q.page - 1) * q.limit,
        take: q.limit,
      }),
      this.prisma.patient.count({ where }),
    ]);
    return {
      data,
      meta: {
        page: q.page,
        limit: q.limit,
        total,
        totalPages: Math.ceil(total / q.limit),
      },
    };
  }
  async get(c: TrustedTenantContext, id: string) {
    const patient = await this.prisma.patient.findFirst({
      where: { id, tenantId: c.tenantId },
    });
    if (!patient) throw new NotFoundException('Patient not found.');
    return patient;
  }
  async duplicates(
    c: TrustedTenantContext,
    dto: DuplicateCheckDto,
    excludeId?: string,
  ) {
    let normalizedPhone: string;
    try {
      normalizedPhone = phone(dto.phone, true)!;
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
    const matches = await this.prisma.patient.findMany({
      where: {
        tenantId: c.tenantId,
        ...(excludeId ? { id: { not: excludeId } } : {}),
        OR: [
          { phone: normalizedPhone },
          {
            normalizedFirstName: normalizedName(dto.firstName),
            normalizedLastName: normalizedName(dto.lastName),
            dateOfBirth: this.dob(dto.dateOfBirth),
          },
        ],
      },
      orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
      take: 10,
    });
    return matches.map((p) => ({
      id: p.id,
      firstName: p.firstName,
      middleName: p.middleName,
      lastName: p.lastName,
      dateOfBirth: p.dateOfBirth,
      maskedPhone: `•••• ${p.phone.slice(-4)}`,
      maskedEmail: p.email
        ? `${p.email.slice(0, 1)}•••@${p.email.split('@')[1]}`
        : null,
      status: p.status,
    }));
  }
  async create(c: TrustedTenantContext, dto: CreatePatientDto) {
    if (!dto.createAnyway) {
      const candidates = await this.duplicates(c, dto);
      if (candidates.length)
        throw new ConflictException({
          message: 'Possible existing patient.',
          code: 'POSSIBLE_DUPLICATE',
          candidates,
        });
    }
    const input: Omit<CreatePatientDto, 'createAnyway'> = { ...dto };
    delete (input as { createAnyway?: boolean }).createAnyway;
    return this.prisma.patient.create({
      data: {
        ...(this.data(input) as Prisma.PatientUncheckedCreateInput),
        tenantId: c.tenantId,
      },
    });
  }
  async update(c: TrustedTenantContext, id: string, dto: UpdatePatientDto) {
    await this.get(c, id);
    return this.prisma.patient.update({
      where: { tenantId_id: { tenantId: c.tenantId, id } },
      data: this.data(dto, true),
    });
  }
  async status(c: TrustedTenantContext, id: string, status: PatientStatus) {
    await this.get(c, id);
    return this.prisma.patient.update({
      where: { tenantId_id: { tenantId: c.tenantId, id } },
      data: { status },
    });
  }
}
type PatientInput = Omit<CreatePatientDto, 'createAnyway'> | UpdatePatientDto;
