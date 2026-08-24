import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiHeader, ApiTags } from '@nestjs/swagger';
import { TenantRole } from '@prisma/client';
import { CurrentTenant } from '../tenants/decorators/current-tenant.decorator';
import { TenantContextRequired } from '../tenants/decorators/tenant-context-required.decorator';
import { TenantRoles } from '../tenants/decorators/tenant-roles.decorator';
import { TrustedTenantContext } from '../tenants/types/tenant-context';
import {
  CreatePatientDto,
  DuplicateCheckDto,
  ListPatientsDto,
  UpdatePatientDto,
  UpdatePatientStatusDto,
} from './dto/patient.dto';
import { PatientsService } from './patients.service';
const ALL = [
  TenantRole.CLINIC_OWNER,
  TenantRole.CLINIC_ADMIN,
  TenantRole.RECEPTIONIST,
];
const ADMIN = [TenantRole.CLINIC_OWNER, TenantRole.CLINIC_ADMIN];
@ApiTags('patients')
@ApiBearerAuth()
@ApiHeader({
  name: 'X-Tenant-Id',
  required: true,
  description:
    'Tenant selection validated against active membership; not an authorization credential.',
})
@TenantContextRequired()
@Controller('patients')
export class PatientsController {
  constructor(private readonly patients: PatientsService) {}
  @Get() @TenantRoles(...ALL) list(
    @CurrentTenant() c: TrustedTenantContext,
    @Query() q: ListPatientsDto,
  ) {
    return this.patients.list(c, q);
  }
  @Post('duplicate-check') @TenantRoles(...ALL) duplicates(
    @CurrentTenant() c: TrustedTenantContext,
    @Body() d: DuplicateCheckDto,
  ) {
    return this.patients.duplicates(c, d, d.patientId);
  }
  @Post() @TenantRoles(...ALL) create(
    @CurrentTenant() c: TrustedTenantContext,
    @Body() d: CreatePatientDto,
  ) {
    return this.patients.create(c, d);
  }
  @Get(':patientId') @TenantRoles(...ALL) get(
    @CurrentTenant() c: TrustedTenantContext,
    @Param('patientId') id: string,
  ) {
    return this.patients.get(c, id);
  }
  @Patch(':patientId') @TenantRoles(...ALL) update(
    @CurrentTenant() c: TrustedTenantContext,
    @Param('patientId') id: string,
    @Body() d: UpdatePatientDto,
  ) {
    return this.patients.update(c, id, d);
  }
  @Patch(':patientId/status') @TenantRoles(...ADMIN) status(
    @CurrentTenant() c: TrustedTenantContext,
    @Param('patientId') id: string,
    @Body() d: UpdatePatientStatusDto,
  ) {
    return this.patients.status(c, id, d.status);
  }
}
