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
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { AuthenticatedUser } from '../auth/types/authenticated-user';
import { CurrentTenant } from '../tenants/decorators/current-tenant.decorator';
import { TenantContextRequired } from '../tenants/decorators/tenant-context-required.decorator';
import { TenantRoles } from '../tenants/decorators/tenant-roles.decorator';
import { TrustedTenantContext } from '../tenants/types/tenant-context';
import { AppointmentsService } from './appointments.service';
import {
  AvailabilityDto,
  CancelAppointmentDto,
  CreateAppointmentDto,
  EligibleProvidersDto,
  ListAppointmentsDto,
  RescheduleAppointmentDto,
  UpdateAppointmentDto,
} from './dto/appointment.dto';

const OPERATIONAL = [
  TenantRole.CLINIC_OWNER,
  TenantRole.CLINIC_ADMIN,
  TenantRole.RECEPTIONIST,
];

@ApiTags('scheduling')
@ApiBearerAuth()
@ApiHeader({ name: 'X-Tenant-Id', required: true })
@TenantContextRequired()
@TenantRoles(...OPERATIONAL)
@Controller('scheduling')
export class SchedulingController {
  constructor(private readonly appointments: AppointmentsService) {}
  @Get('availability') availability(
    @CurrentTenant() c: TrustedTenantContext,
    @Query() q: AvailabilityDto,
  ) {
    return this.appointments.availability(c, q);
  }
  @Get('providers') providers(
    @CurrentTenant() c: TrustedTenantContext,
    @Query() q: EligibleProvidersDto,
  ) {
    return this.appointments.eligibleProviders(c, q);
  }
}

@ApiTags('appointments')
@ApiBearerAuth()
@ApiHeader({ name: 'X-Tenant-Id', required: true })
@TenantContextRequired()
@TenantRoles(...OPERATIONAL)
@Controller('appointments')
export class AppointmentsController {
  constructor(private readonly appointments: AppointmentsService) {}
  @Get() list(
    @CurrentTenant() c: TrustedTenantContext,
    @Query() q: ListAppointmentsDto,
  ) {
    return this.appointments.list(c, q);
  }
  @Post() create(
    @CurrentTenant() c: TrustedTenantContext,
    @CurrentUser() u: AuthenticatedUser,
    @Body() d: CreateAppointmentDto,
  ) {
    return this.appointments.create(c, u.userId, d);
  }
  @Get(':appointmentId') get(
    @CurrentTenant() c: TrustedTenantContext,
    @Param('appointmentId') id: string,
  ) {
    return this.appointments.get(c, id);
  }
  @Patch(':appointmentId') update(
    @CurrentTenant() c: TrustedTenantContext,
    @Param('appointmentId') id: string,
    @Body() d: UpdateAppointmentDto,
  ) {
    return this.appointments.update(c, id, d);
  }
  @Post(':appointmentId/reschedule') reschedule(
    @CurrentTenant() c: TrustedTenantContext,
    @CurrentUser() u: AuthenticatedUser,
    @Param('appointmentId') id: string,
    @Body() d: RescheduleAppointmentDto,
  ) {
    return this.appointments.reschedule(c, u.userId, id, d);
  }
  @Post(':appointmentId/cancel') cancel(
    @CurrentTenant() c: TrustedTenantContext,
    @CurrentUser() u: AuthenticatedUser,
    @Param('appointmentId') id: string,
    @Body() d: CancelAppointmentDto,
  ) {
    return this.appointments.cancel(c, u.userId, id, d);
  }
  @Post(':appointmentId/confirm') confirm(
    @CurrentTenant() c: TrustedTenantContext,
    @CurrentUser() u: AuthenticatedUser,
    @Param('appointmentId') id: string,
  ) {
    return this.appointments.confirm(c, u.userId, id);
  }
}
