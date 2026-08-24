import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { PlatformRole } from '@prisma/client';
import { PlatformRoles } from '../auth/decorators/platform-roles.decorator';
import {
  AddMemberDto,
  CreateTenantDto,
  ListTenantsDto,
  UpdateMemberDto,
  UpdateTenantDto,
} from './dto/tenant.dto';
import { TenantsService } from './tenants.service';

@ApiTags('platform tenants')
@ApiBearerAuth()
@PlatformRoles(PlatformRole.SUPER_ADMIN)
@Controller('tenants')
export class TenantsController {
  constructor(private readonly tenants: TenantsService) {}
  @Post() @ApiOperation({ summary: 'Create a tenant (SUPER_ADMIN)' }) create(
    @Body() dto: CreateTenantDto,
  ) {
    return this.tenants.create(dto);
  }
  @Get() @ApiOperation({ summary: 'List tenants (SUPER_ADMIN)' }) list(
    @Query() query: ListTenantsDto,
  ) {
    return this.tenants.list(query);
  }
  @Get(':tenantId')
  @ApiOperation({ summary: 'Get a tenant (SUPER_ADMIN)' })
  get(@Param('tenantId') id: string) {
    return this.tenants.get(id);
  }
  @Patch(':tenantId')
  @ApiOperation({ summary: 'Update a tenant (SUPER_ADMIN)' })
  update(@Param('tenantId') id: string, @Body() dto: UpdateTenantDto) {
    return this.tenants.update(id, dto);
  }
  @Get(':tenantId/members')
  @ApiOperation({ summary: 'List tenant memberships (SUPER_ADMIN)' })
  members(@Param('tenantId') id: string) {
    return this.tenants.listMembers(id);
  }
  @Post(':tenantId/members')
  @ApiOperation({ summary: 'Add an existing user to a tenant (SUPER_ADMIN)' })
  addMember(@Param('tenantId') id: string, @Body() dto: AddMemberDto) {
    return this.tenants.addMember(id, dto);
  }
  @Patch(':tenantId/members/:membershipId')
  @ApiOperation({ summary: 'Update a membership (SUPER_ADMIN)' })
  updateMember(
    @Param('tenantId') id: string,
    @Param('membershipId') memberId: string,
    @Body() dto: UpdateMemberDto,
  ) {
    return this.tenants.updateMember(id, memberId, dto);
  }
  @Delete(':tenantId/members/:membershipId')
  @ApiOperation({ summary: 'Deactivate a membership (SUPER_ADMIN)' })
  deactivate(
    @Param('tenantId') id: string,
    @Param('membershipId') memberId: string,
  ) {
    return this.tenants.deactivateMember(id, memberId);
  }
}
