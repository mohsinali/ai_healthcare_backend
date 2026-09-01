import { randomUUID } from 'node:crypto';
import { TelephonyProvider } from '@prisma/client';
import { PrismaService } from '../database/prisma.service';
import { TelephonyService } from './telephony.service';

const describeDatabase = process.env.RUN_TELEPHONY_INTEGRATION_TESTS
  ? describe
  : describe.skip;

describeDatabase('TelephonyNumber database uniqueness', () => {
  const prisma = new PrismaService();
  const service = new TelephonyService(prisma);
  const tenantA = randomUUID();
  const tenantB = randomUUID();
  const suffix = tenantA.replaceAll('-', '').slice(0, 7);
  const phoneNumber = `+1202${suffix}`;

  beforeAll(async () => {
    await prisma.$connect();
    await prisma.tenant.createMany({
      data: [
        { id: tenantA, name: 'Telephony A', slug: `telephony-a-${tenantA}` },
        { id: tenantB, name: 'Telephony B', slug: `telephony-b-${tenantB}` },
      ],
    });
  });

  afterAll(async () => {
    await prisma.telephonyNumber.deleteMany({
      where: { tenantId: { in: [tenantA, tenantB] } },
    });
    await prisma.tenant.deleteMany({
      where: { id: { in: [tenantA, tenantB] } },
    });
    await prisma.$disconnect();
  });

  it('allows exactly one concurrent claim across tenants', async () => {
    const results = await Promise.allSettled([
      service.create({ tenantId: tenantA } as never, {
        phoneNumber,
        provider: TelephonyProvider.TWILIO,
      }),
      service.create({ tenantId: tenantB } as never, {
        phoneNumber,
        provider: TelephonyProvider.TWILIO,
      }),
    ]);
    expect(results.filter(({ status }) => status === 'fulfilled')).toHaveLength(
      1,
    );
    expect(results.filter(({ status }) => status === 'rejected')).toHaveLength(
      1,
    );
    await expect(
      prisma.telephonyNumber.count({ where: { phoneNumber } }),
    ).resolves.toBe(1);
  });
});
