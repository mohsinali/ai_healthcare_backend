import { NotFoundException } from '@nestjs/common';
import { ConfigurationStatus } from '@prisma/client';
import { VoiceSelectedLocationService } from './voice-selected-location.service';

describe('VoiceSelectedLocationService', () => {
  const tenantId = '11111111-1111-4111-8111-111111111111';

  it('resolves an active location number only inside the trusted tenant', async () => {
    const findFirst = jest.fn().mockResolvedValue({ id: 'gulshan-id' });
    const service = new VoiceSelectedLocationService({
      location: { findFirst },
    } as never);

    await expect(service.resolve(tenantId, 'GLN-002')).resolves.toBe(
      'gulshan-id',
    );
    expect(findFirst).toHaveBeenCalledWith({
      where: {
        tenantId,
        locationNumber: 'GLN-002',
        status: ConfigurationStatus.ACTIVE,
      },
      select: { id: true },
    });
  });

  it.each([
    'an unknown location',
    'another tenant location',
    'an inactive location',
  ])('rejects %s with the same safe response', async () => {
    const service = new VoiceSelectedLocationService({
      location: { findFirst: jest.fn().mockResolvedValue(null) },
    } as never);

    await expect(service.resolve(tenantId, 'UNAVAILABLE')).rejects.toEqual(
      new NotFoundException('Selected clinic location is unavailable.'),
    );
  });
});
