import { Injectable, NotFoundException } from '@nestjs/common';
import { ConfigurationStatus } from '@prisma/client';
import { PrismaService } from '../database/prisma.service';

@Injectable()
export class VoiceSelectedLocationService {
  constructor(private readonly prisma: PrismaService) {}

  async resolve(tenantId: string, locationNumber: string): Promise<string> {
    const location = await this.prisma.location.findFirst({
      where: {
        tenantId,
        locationNumber,
        status: ConfigurationStatus.ACTIVE,
      },
      select: { id: true },
    });

    if (!location) {
      throw new NotFoundException('Selected clinic location is unavailable.');
    }

    return location.id;
  }
}
