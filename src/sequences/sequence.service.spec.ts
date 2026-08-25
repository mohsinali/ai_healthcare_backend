import { Prisma, SequenceType } from '@prisma/client';
import { PrismaService } from '../database/prisma.service';
import { SequenceService } from './sequence.service';

function serviceReturning(...values: number[]) {
  const query = jest.fn();
  for (const value of values) {
    query.mockResolvedValueOnce([{ value, prefix: 'APT-', padding: 2 }]);
  }
  return {
    query,
    service: new SequenceService({
      $queryRaw: query,
    } as unknown as PrismaService),
  };
}

describe('SequenceService', () => {
  it.each([
    [1, 'APT-01'],
    [2, 'APT-02'],
    [9, 'APT-09'],
    [10, 'APT-10'],
    [99, 'APT-99'],
    [100, 'APT-100'],
  ])(
    'formats allocation %i as %s without truncation',
    async (value, expected) => {
      const { service } = serviceReturning(value);
      await expect(
        service.next(
          '10000000-0000-4000-8000-000000000001',
          SequenceType.APPOINTMENT,
        ),
      ).resolves.toEqual({ value, formatted: expected });
    },
  );

  it('uses one atomic database statement per allocation', async () => {
    const { service, query } = serviceReturning(1, 2);
    const tenantId = '10000000-0000-4000-8000-000000000001';
    await service.next(tenantId, SequenceType.APPOINTMENT);
    await service.next(tenantId, SequenceType.APPOINTMENT);
    expect(query).toHaveBeenCalledTimes(2);
  });

  it('uses the supplied transaction client', async () => {
    const { service } = serviceReturning();
    const transactionQuery = jest
      .fn()
      .mockResolvedValue([{ value: 1, prefix: 'APT-', padding: 2 }]);
    await service.next(
      '10000000-0000-4000-8000-000000000001',
      SequenceType.APPOINTMENT,
      { $queryRaw: transactionQuery },
    );
    expect(transactionQuery).toHaveBeenCalledTimes(1);
  });

  it.each([
    [SequenceType.LOCATION, 'LOC-', 'LOC-01'],
    [SequenceType.SERVICE, 'SRV-', 'SRV-01'],
    [SequenceType.PROVIDER, 'PRV-', 'PRV-01'],
    [SequenceType.PATIENT, 'PAT-', 'PAT-01'],
  ])('uses the centralized default for %s', async (type, prefix, formatted) => {
    const query = jest.fn().mockImplementation((sql: Prisma.Sql) => {
      expect(sql.values).toEqual(expect.arrayContaining([type, prefix, 2]));
      return Promise.resolve([{ value: 1, prefix, padding: 2 }]);
    });
    const service = new SequenceService({ $queryRaw: query } as never);
    await expect(
      service.next('10000000-0000-4000-8000-000000000001', type),
    ).resolves.toEqual({ value: 1, formatted });
  });
});
