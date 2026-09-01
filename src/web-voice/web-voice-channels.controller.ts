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
  CreateWebVoiceChannelDto,
  ListWebVoiceChannelsDto,
  UpdateWebVoiceChannelDto,
  UpdateWebVoiceChannelStatusDto,
} from './dto/web-voice-channel.dto';
import { WebVoiceChannelsService } from './web-voice-channels.service';

const READ = [
  TenantRole.CLINIC_OWNER,
  TenantRole.CLINIC_ADMIN,
  TenantRole.RECEPTIONIST,
];
const WRITE = [TenantRole.CLINIC_OWNER, TenantRole.CLINIC_ADMIN];

@ApiTags('web voice channels')
@ApiBearerAuth()
@ApiHeader({
  name: 'X-Tenant-Id',
  required: true,
  description: 'Trusted tenant context; body fields cannot override ownership.',
})
@TenantContextRequired()
@Controller('web-voice-channels')
export class WebVoiceChannelsController {
  constructor(private readonly channels: WebVoiceChannelsService) {}

  @Get()
  @TenantRoles(...READ)
  list(
    @CurrentTenant() context: TrustedTenantContext,
    @Query() query: ListWebVoiceChannelsDto,
  ) {
    return this.channels.list(context, query);
  }

  @Post()
  @TenantRoles(...WRITE)
  @ApiOperation({
    summary: 'Create a web voice channel and server-generated widget key',
  })
  create(
    @CurrentTenant() context: TrustedTenantContext,
    @Body() dto: CreateWebVoiceChannelDto,
  ) {
    return this.channels.create(context, dto);
  }

  @Get(':id')
  @TenantRoles(...READ)
  get(@CurrentTenant() context: TrustedTenantContext, @Param('id') id: string) {
    return this.channels.get(context, id);
  }

  @Patch(':id')
  @TenantRoles(...WRITE)
  update(
    @CurrentTenant() context: TrustedTenantContext,
    @Param('id') id: string,
    @Body() dto: UpdateWebVoiceChannelDto,
  ) {
    return this.channels.update(context, id, dto);
  }

  @Patch(':id/status')
  @TenantRoles(...WRITE)
  status(
    @CurrentTenant() context: TrustedTenantContext,
    @Param('id') id: string,
    @Body() dto: UpdateWebVoiceChannelStatusDto,
  ) {
    return this.channels.status(context, id, dto.status);
  }
}
