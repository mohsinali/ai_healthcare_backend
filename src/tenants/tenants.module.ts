import { Module } from '@nestjs/common';
import { DatabaseModule } from '../database/database.module';
import { AuthModule } from '../auth/auth.module';
import { TenantsController } from './tenants.controller';
import { TenantsService } from './tenants.service';
import { TenantProvisioningService } from './tenant-provisioning.service';
@Module({
  imports: [DatabaseModule, AuthModule],
  controllers: [TenantsController],
  providers: [TenantsService, TenantProvisioningService],
  exports: [TenantsService],
})
export class TenantsModule {}
