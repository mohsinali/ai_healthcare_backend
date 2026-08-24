import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Put,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiHeader, ApiTags } from '@nestjs/swagger';
import { TenantRole } from '@prisma/client';
import { CurrentTenant } from '../tenants/decorators/current-tenant.decorator';
import { TenantContextRequired } from '../tenants/decorators/tenant-context-required.decorator';
import { TenantRoles } from '../tenants/decorators/tenant-roles.decorator';
import { TrustedTenantContext as TenantContext } from '../tenants/types/tenant-context';
import {
  CreateLocationDto,
  CreateProviderDto,
  CreateServiceDto,
  EditLocationDto,
  EditProviderDto,
  EditServiceDto,
  ListConfigurationDto,
  ReplaceAssignmentsDto,
  UpdateBusinessHoursDto,
  UpdateLocationDto,
  UpdateProviderDto,
  UpdateServiceDto,
} from './dto/clinic-config.dto';
import { LocationsService } from './locations.service';
import { ProvidersService } from './providers.service';
import { ServicesService } from './services.service';
const READ = [
  TenantRole.CLINIC_OWNER,
  TenantRole.CLINIC_ADMIN,
  TenantRole.RECEPTIONIST,
];
const WRITE = [TenantRole.CLINIC_OWNER, TenantRole.CLINIC_ADMIN];
@ApiBearerAuth()
@ApiHeader({
  name: 'X-Tenant-Id',
  required: true,
  description:
    'Requested tenant selection; active membership is validated by the server.',
})
@TenantContextRequired()
export abstract class ClinicController {}
@ApiTags('clinic locations')
@Controller('locations')
export class LocationsController extends ClinicController {
  constructor(private readonly service: LocationsService) {
    super();
  }
  @Get() @TenantRoles(...READ) list(
    @CurrentTenant() c: TenantContext,
    @Query() q: ListConfigurationDto,
  ) {
    return this.service.list(c, q);
  }
  @Post() @TenantRoles(...WRITE) create(
    @CurrentTenant() c: TenantContext,
    @Body() d: CreateLocationDto,
  ) {
    return this.service.create(c, d);
  }
  @Get(':id') @TenantRoles(...READ) get(
    @CurrentTenant() c: TenantContext,
    @Param('id') id: string,
  ) {
    return this.service.get(c, id);
  }
  @Patch(':id') @TenantRoles(...WRITE) update(
    @CurrentTenant() c: TenantContext,
    @Param('id') id: string,
    @Body() d: UpdateLocationDto,
  ) {
    return this.service.update(c, id, d);
  }
  @Put(':id/edit') @TenantRoles(...WRITE) edit(
    @CurrentTenant() c: TenantContext,
    @Param('id') id: string,
    @Body() d: EditLocationDto,
  ) {
    return this.service.edit(c, id, d);
  }
  @Get(':id/business-hours') @TenantRoles(...READ) hours(
    @CurrentTenant() c: TenantContext,
    @Param('id') id: string,
  ) {
    return this.service.businessHours(c, id);
  }
  @Put(':id/business-hours') @TenantRoles(...WRITE) updateHours(
    @CurrentTenant() c: TenantContext,
    @Param('id') id: string,
    @Body() d: UpdateBusinessHoursDto,
  ) {
    return this.service.updateBusinessHours(c, id, d);
  }
  @Get(':id/services') @TenantRoles(...READ) services(
    @CurrentTenant() c: TenantContext,
    @Param('id') id: string,
  ) {
    return this.service.services(c, id);
  }
  @Put(':id/services') @TenantRoles(...WRITE) replaceServices(
    @CurrentTenant() c: TenantContext,
    @Param('id') id: string,
    @Body() d: ReplaceAssignmentsDto,
  ) {
    return this.service.replaceServices(c, id, d);
  }
}
@ApiTags('clinic providers')
@Controller('providers')
export class ProvidersController extends ClinicController {
  constructor(private readonly service: ProvidersService) {
    super();
  }
  @Get() @TenantRoles(...READ) list(
    @CurrentTenant() c: TenantContext,
    @Query() q: ListConfigurationDto,
  ) {
    return this.service.list(c, q);
  }
  @Post() @TenantRoles(...WRITE) create(
    @CurrentTenant() c: TenantContext,
    @Body() d: CreateProviderDto,
  ) {
    return this.service.create(c, d);
  }
  @Get(':id') @TenantRoles(...READ) get(
    @CurrentTenant() c: TenantContext,
    @Param('id') id: string,
  ) {
    return this.service.get(c, id);
  }
  @Patch(':id') @TenantRoles(...WRITE) update(
    @CurrentTenant() c: TenantContext,
    @Param('id') id: string,
    @Body() d: UpdateProviderDto,
  ) {
    return this.service.update(c, id, d);
  }
  @Put(':id/edit') @TenantRoles(...WRITE) edit(
    @CurrentTenant() c: TenantContext,
    @Param('id') id: string,
    @Body() d: EditProviderDto,
  ) {
    return this.service.edit(c, id, d);
  }
  @Get(':id/locations') @TenantRoles(...READ) locations(
    @CurrentTenant() c: TenantContext,
    @Param('id') id: string,
  ) {
    return this.service.locations(c, id);
  }
  @Put(':id/locations') @TenantRoles(...WRITE) replaceLocations(
    @CurrentTenant() c: TenantContext,
    @Param('id') id: string,
    @Body() d: ReplaceAssignmentsDto,
  ) {
    return this.service.replaceLocations(c, id, d);
  }
  @Get(':id/services') @TenantRoles(...READ) services(
    @CurrentTenant() c: TenantContext,
    @Param('id') id: string,
  ) {
    return this.service.services(c, id);
  }
  @Put(':id/services') @TenantRoles(...WRITE) replaceServices(
    @CurrentTenant() c: TenantContext,
    @Param('id') id: string,
    @Body() d: ReplaceAssignmentsDto,
  ) {
    return this.service.replaceServices(c, id, d);
  }
}
@ApiTags('clinic services')
@Controller('services')
export class ServicesController extends ClinicController {
  constructor(private readonly service: ServicesService) {
    super();
  }
  @Get() @TenantRoles(...READ) list(
    @CurrentTenant() c: TenantContext,
    @Query() q: ListConfigurationDto,
  ) {
    return this.service.list(c, q);
  }
  @Post() @TenantRoles(...WRITE) create(
    @CurrentTenant() c: TenantContext,
    @Body() d: CreateServiceDto,
  ) {
    return this.service.create(c, d);
  }
  @Get(':id') @TenantRoles(...READ) get(
    @CurrentTenant() c: TenantContext,
    @Param('id') id: string,
  ) {
    return this.service.get(c, id);
  }
  @Patch(':id') @TenantRoles(...WRITE) update(
    @CurrentTenant() c: TenantContext,
    @Param('id') id: string,
    @Body() d: UpdateServiceDto,
  ) {
    return this.service.update(c, id, d);
  }
  @Put(':id/edit') @TenantRoles(...WRITE) edit(
    @CurrentTenant() c: TenantContext,
    @Param('id') id: string,
    @Body() d: EditServiceDto,
  ) {
    return this.service.edit(c, id, d);
  }
  @Get(':id/providers') @TenantRoles(...READ) providers(
    @CurrentTenant() c: TenantContext,
    @Param('id') id: string,
  ) {
    return this.service.providers(c, id);
  }
  @Put(':id/providers') @TenantRoles(...WRITE) replaceProviders(
    @CurrentTenant() c: TenantContext,
    @Param('id') id: string,
    @Body() d: ReplaceAssignmentsDto,
  ) {
    return this.service.replaceProviders(c, id, d);
  }
  @Get(':id/locations') @TenantRoles(...READ) locations(
    @CurrentTenant() c: TenantContext,
    @Param('id') id: string,
  ) {
    return this.service.locations(c, id);
  }
  @Put(':id/locations') @TenantRoles(...WRITE) replaceLocations(
    @CurrentTenant() c: TenantContext,
    @Param('id') id: string,
    @Body() d: ReplaceAssignmentsDto,
  ) {
    return this.service.replaceLocations(c, id, d);
  }
}
