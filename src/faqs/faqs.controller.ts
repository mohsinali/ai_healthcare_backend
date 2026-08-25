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
  CreateFaqDto,
  ListFaqsDto,
  UpdateFaqDto,
  UpdateFaqStatusDto,
} from './dto/faq.dto';
import { FaqsService } from './faqs.service';

const READ = [
  TenantRole.CLINIC_OWNER,
  TenantRole.CLINIC_ADMIN,
  TenantRole.RECEPTIONIST,
];
const WRITE = [TenantRole.CLINIC_OWNER, TenantRole.CLINIC_ADMIN];

@ApiTags('faqs')
@ApiBearerAuth()
@ApiHeader({
  name: 'X-Tenant-Id',
  required: true,
  description:
    'Selects tenant context; active membership is validated by the server and this header is not authorization.',
})
@TenantContextRequired()
@Controller('faqs')
export class FaqsController {
  constructor(private readonly faqs: FaqsService) {}

  @Get()
  @TenantRoles(...READ)
  @ApiOperation({ summary: 'List and search tenant FAQs' })
  list(
    @CurrentTenant() context: TrustedTenantContext,
    @Query() query: ListFaqsDto,
  ) {
    return this.faqs.list(context, query);
  }

  @Post()
  @TenantRoles(...WRITE)
  @ApiOperation({ summary: 'Create an FAQ' })
  create(
    @CurrentTenant() context: TrustedTenantContext,
    @Body() dto: CreateFaqDto,
  ) {
    return this.faqs.create(context, dto);
  }

  @Get(':faqId')
  @TenantRoles(...READ)
  @ApiOperation({ summary: 'Get an FAQ' })
  get(
    @CurrentTenant() context: TrustedTenantContext,
    @Param('faqId') id: string,
  ) {
    return this.faqs.get(context, id);
  }

  @Patch(':faqId')
  @TenantRoles(...WRITE)
  @ApiOperation({ summary: 'Update FAQ content or scope' })
  update(
    @CurrentTenant() context: TrustedTenantContext,
    @Param('faqId') id: string,
    @Body() dto: UpdateFaqDto,
  ) {
    return this.faqs.update(context, id, dto);
  }

  @Patch(':faqId/status')
  @TenantRoles(...WRITE)
  @ApiOperation({ summary: 'Activate or deactivate an FAQ' })
  status(
    @CurrentTenant() context: TrustedTenantContext,
    @Param('faqId') id: string,
    @Body() dto: UpdateFaqStatusDto,
  ) {
    return this.faqs.status(context, id, dto.status);
  }
}
