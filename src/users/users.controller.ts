import { Controller, Get, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { PlatformRole } from '@prisma/client';
import { PlatformRoles } from '../auth/decorators/platform-roles.decorator';
import { UserSearchDto } from '../tenants/dto/tenant.dto';
import { UsersService } from './users.service';
@ApiTags('platform users')
@ApiBearerAuth()
@PlatformRoles(PlatformRole.SUPER_ADMIN)
@Controller('users')
export class UsersController {
  constructor(private readonly users: UsersService) {}
  @Get('search')
  @ApiOperation({
    summary: 'Search safe user identities for tenant assignment (SUPER_ADMIN)',
  })
  search(@Query() query: UserSearchDto) {
    return this.users.search(query.query);
  }
}
