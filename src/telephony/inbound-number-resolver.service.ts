import { Injectable } from '@nestjs/common';
import {
  ConfigurationStatus,
  TelephonyNumberStatus,
  TenantStatus,
} from '@prisma/client';
import { phone } from '../clinic-config/clinic-config.helpers';
import { PrismaService } from '../database/prisma.service';
import {
  InboundNumberResolutionError,
  InboundNumberResolutionFailure,
} from './inbound-number-resolution.error';
import { ResolvedInboundNumberContext } from './types/resolved-inbound-number-context';

@Injectable()
export class InboundNumberResolverService {
  constructor(private readonly prisma: PrismaService) {}

  async resolve(calledNumber: string): Promise<ResolvedInboundNumberContext> {
    let normalized: string;
    try {
      normalized = phone(calledNumber, true)!;
    } catch {
      throw new InboundNumberResolutionError(
        InboundNumberResolutionFailure.INVALID_PHONE_NUMBER,
      );
    }
    const mapping = await this.prisma.telephonyNumber.findUnique({
      where: { phoneNumber: normalized },
      include: {
        tenant: { select: { id: true, name: true, slug: true, status: true } },
        location: {
          select: {
            id: true,
            name: true,
            status: true,
            timezone: true,
            escalationPhoneNumber: true,
          },
        },
      },
    });
    if (!mapping)
      throw new InboundNumberResolutionError(
        InboundNumberResolutionFailure.NUMBER_NOT_FOUND,
      );
    if (mapping.status !== TelephonyNumberStatus.ACTIVE)
      throw new InboundNumberResolutionError(
        InboundNumberResolutionFailure.NUMBER_INACTIVE,
      );
    if (mapping.tenant.status !== TenantStatus.ACTIVE)
      throw new InboundNumberResolutionError(
        InboundNumberResolutionFailure.TENANT_INACTIVE,
      );
    if (
      mapping.location &&
      mapping.location.status !== ConfigurationStatus.ACTIVE
    )
      throw new InboundNumberResolutionError(
        InboundNumberResolutionFailure.LOCATION_INACTIVE,
      );
    return {
      telephonyNumberId: mapping.id,
      phoneNumber: mapping.phoneNumber,
      provider: mapping.provider,
      providerPhoneNumberId: mapping.providerPhoneNumberId,
      tenantId: mapping.tenant.id,
      tenantName: mapping.tenant.name,
      tenantSlug: mapping.tenant.slug,
      locationId: mapping.location?.id ?? null,
      locationName: mapping.location?.name ?? null,
      timezone: mapping.location?.timezone ?? null,
      escalationPhoneNumber: mapping.location?.escalationPhoneNumber ?? null,
    };
  }
}
