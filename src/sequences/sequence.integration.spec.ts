import { SequenceType } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { PrismaService } from '../database/prisma.service';
import { SequenceService } from './sequence.service';

const describeDatabase = process.env.RUN_SEQUENCE_INTEGRATION_TESTS
  ? describe
  : describe.skip;

describeDatabase('SequenceService database concurrency', () => {
  const prisma = new PrismaService();
  const service = new SequenceService(prisma);
  const tenantId = randomUUID();

  beforeAll(async () => {
    await prisma.$connect();
    await prisma.tenant.create({
      data: {
        id: tenantId,
        name: 'Sequence test',
        slug: `sequence-${tenantId}`,
      },
    });
  });

  afterAll(async () => {
    await prisma.tenant.delete({ where: { id: tenantId } });
    await prisma.$disconnect();
  });

  it('atomically initializes and allocates 20 unique tenant values', async () => {
    const allocated = await Promise.all(
      Array.from({ length: 20 }, () =>
        service.next(tenantId, SequenceType.APPOINTMENT),
      ),
    );
    expect(new Set(allocated.map(({ value }) => value)).size).toBe(20);
    expect(new Set(allocated.map(({ formatted }) => formatted)).size).toBe(20);
    expect(allocated.map(({ value }) => value).sort((a, b) => a - b)).toEqual(
      Array.from({ length: 20 }, (_, index) => index + 1),
    );
    await expect(
      prisma.sequence.findUniqueOrThrow({
        where: { tenantId_type: { tenantId, type: 'APPOINTMENT' } },
      }),
    ).resolves.toMatchObject({
      prefix: 'APT-',
      padding: 2,
      nextValue: 21,
    });
    await expect(
      prisma.sequence.count({ where: { tenantId, type: 'APPOINTMENT' } }),
    ).resolves.toBe(1);
  });

  it('keeps another tenant independent', async () => {
    const otherTenantId = randomUUID();
    await prisma.tenant.create({
      data: {
        id: otherTenantId,
        name: 'Other sequence test',
        slug: `sequence-${otherTenantId}`,
      },
    });
    await expect(
      service.next(otherTenantId, SequenceType.APPOINTMENT),
    ).resolves.toEqual({ value: 1, formatted: 'APT-01' });
    await prisma.tenant.delete({ where: { id: otherTenantId } });
  });
});
