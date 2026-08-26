import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiHeader,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { TenantRole } from '@prisma/client';
import { CurrentTenant } from '../tenants/decorators/current-tenant.decorator';
import { TenantContextRequired } from '../tenants/decorators/tenant-context-required.decorator';
import { TenantRoles } from '../tenants/decorators/tenant-roles.decorator';
import { TrustedTenantContext } from '../tenants/types/tenant-context';
import {
  CreateTelephonyNumberDto,
  ListTelephonyNumbersDto,
  UpdateTelephonyNumberDto,
  UpdateTelephonyNumberStatusDto,
} from './dto/telephony-number.dto';
import { TelephonyService } from './telephony.service';

const READ = [
  TenantRole.CLINIC_OWNER,
  TenantRole.CLINIC_ADMIN,
  TenantRole.RECEPTIONIST,
];
const WRITE = [TenantRole.CLINIC_OWNER, TenantRole.CLINIC_ADMIN];

@ApiTags('telephony numbers')
@ApiBearerAuth()
@ApiHeader({
  name: 'X-Tenant-Id',
  required: true,
  description:
    'Selects the trusted tenant context. Active membership is validated by the server; request bodies cannot override ownership.',
})
@TenantContextRequired()
@Controller('telephony-numbers')
export class TelephonyController {
  constructor(private readonly telephony: TelephonyService) {}

  @Get()
  @TenantRoles(...READ)
  @ApiOperation({
    summary: 'List tenant telephony numbers with pagination and filters',
  })
  list(
    @CurrentTenant() context: TrustedTenantContext,
    @Query() query: ListTelephonyNumbersDto,
  ) {
    return this.telephony.list(context, query);
  }

  @Post()
  @TenantRoles(...WRITE)
  @ApiOperation({ summary: 'Configure a globally unique inbound phone number' })
  create(
    @CurrentTenant() context: TrustedTenantContext,
    @Body() dto: CreateTelephonyNumberDto,
  ) {
    return this.telephony.create(context, dto);
  }

  @Get(':id')
  @TenantRoles(...READ)
  @ApiOperation({ summary: 'Get a tenant telephony number' })
  get(@CurrentTenant() context: TrustedTenantContext, @Param('id') id: string) {
    return this.telephony.get(context, id);
  }

  @Patch(':id')
  @TenantRoles(...WRITE)
  @ApiOperation({ summary: 'Update telephony number routing configuration' })
  update(
    @CurrentTenant() context: TrustedTenantContext,
    @Param('id') id: string,
    @Body() dto: UpdateTelephonyNumberDto,
  ) {
    return this.telephony.update(context, id, dto);
  }

  @Patch(':id/status')
  @TenantRoles(...WRITE)
  @ApiOperation({ summary: 'Activate or deactivate a telephony number' })
  status(
    @CurrentTenant() context: TrustedTenantContext,
    @Param('id') id: string,
    @Body() dto: UpdateTelephonyNumberStatusDto,
  ) {
    return this.telephony.status(context, id, dto.status);
  }
}
