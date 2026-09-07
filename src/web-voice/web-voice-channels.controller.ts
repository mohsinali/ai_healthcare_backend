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
import { PlatformRole } from '@prisma/client';
import { PlatformRoles } from '../auth/decorators/platform-roles.decorator';
import { CurrentTenant } from '../tenants/decorators/current-tenant.decorator';
import { TenantContextRequired } from '../tenants/decorators/tenant-context-required.decorator';
import { TrustedTenantContext } from '../tenants/types/tenant-context';
import {
  CreateWebVoiceChannelDto,
  ListWebVoiceChannelsDto,
  UpdateWebVoiceChannelDto,
  UpdateWebVoiceChannelStatusDto,
} from './dto/web-voice-channel.dto';
import { WebVoiceChannelsService } from './web-voice-channels.service';

@ApiTags('web voice channels')
@ApiBearerAuth()
@ApiHeader({
  name: 'X-Tenant-Id',
  required: true,
  description: 'Trusted tenant context; body fields cannot override ownership.',
})
@TenantContextRequired()
@PlatformRoles(PlatformRole.SUPER_ADMIN)
@Controller('web-voice-channels')
export class WebVoiceChannelsController {
  constructor(private readonly channels: WebVoiceChannelsService) {}

  @Get()
  list(
    @CurrentTenant() context: TrustedTenantContext,
    @Query() query: ListWebVoiceChannelsDto,
  ) {
    return this.channels.list(context, query);
  }

  @Post()
  @ApiOperation({
    summary: 'Create a web voice channel and server-generated widget key',
  })
  create(
    @CurrentTenant() context: TrustedTenantContext,
    @Body() dto: CreateWebVoiceChannelDto,
  ) {
    return this.channels.create(context, dto);
  }

  @Get('locations')
  locations(
    @CurrentTenant() context: TrustedTenantContext,
    @Query() query: ListWebVoiceChannelsDto,
  ) {
    return this.channels.listActiveLocations(context, query);
  }

  @Get(':id')
  get(@CurrentTenant() context: TrustedTenantContext, @Param('id') id: string) {
    return this.channels.get(context, id);
  }

  @Patch(':id')
  update(
    @CurrentTenant() context: TrustedTenantContext,
    @Param('id') id: string,
    @Body() dto: UpdateWebVoiceChannelDto,
  ) {
    return this.channels.update(context, id, dto);
  }

  @Patch(':id/status')
  status(
    @CurrentTenant() context: TrustedTenantContext,
    @Param('id') id: string,
    @Body() dto: UpdateWebVoiceChannelStatusDto,
  ) {
    return this.channels.status(context, id, dto.status);
  }
}
