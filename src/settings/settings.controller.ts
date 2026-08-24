import { Body, Controller, Get, Patch } from '@nestjs/common';
import { ApiBearerAuth, ApiHeader, ApiTags } from '@nestjs/swagger';
import { TenantRole } from '@prisma/client';
import { CurrentTenant } from '../tenants/decorators/current-tenant.decorator';
import { TenantContextRequired } from '../tenants/decorators/tenant-context-required.decorator';
import { TenantRoles } from '../tenants/decorators/tenant-roles.decorator';
import { TrustedTenantContext } from '../tenants/types/tenant-context';
import { UpdateSettingsDto } from './dto/settings.dto';
import { SettingsService } from './settings.service';

@ApiTags('settings')
@ApiBearerAuth()
@ApiHeader({ name: 'X-Tenant-Id', required: true })
@TenantContextRequired()
@Controller('settings')
export class SettingsController {
  constructor(private readonly settings: SettingsService) {}

  @Get()
  @TenantRoles(
    TenantRole.CLINIC_OWNER,
    TenantRole.CLINIC_ADMIN,
    TenantRole.RECEPTIONIST,
  )
  get(@CurrentTenant() context: TrustedTenantContext) {
    return this.settings.get(context);
  }

  @Patch()
  @TenantRoles(TenantRole.CLINIC_OWNER)
  update(
    @CurrentTenant() context: TrustedTenantContext,
    @Body() dto: UpdateSettingsDto,
  ) {
    return this.settings.update(context, dto);
  }
}
