import { Injectable } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import { TrustedTenantContext } from '../tenants/types/tenant-context';
import { UpdateSettingsDto } from './dto/settings.dto';

const settingsSelect = { dateFormat: true, timezone: true } as const;

@Injectable()
export class SettingsService {
  constructor(private readonly prisma: PrismaService) {}

  get(context: TrustedTenantContext) {
    return this.prisma.tenant.findUniqueOrThrow({
      where: { id: context.tenantId },
      select: settingsSelect,
    });
  }

  update(context: TrustedTenantContext, dto: UpdateSettingsDto) {
    return this.prisma.tenant.update({
      where: { id: context.tenantId },
      data: { dateFormat: dto.dateFormat, timezone: dto.timezone },
      select: settingsSelect,
    });
  }
}
