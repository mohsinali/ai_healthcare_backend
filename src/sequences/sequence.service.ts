import { Injectable } from '@nestjs/common';
import { Prisma, SequenceType } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { PrismaService } from '../database/prisma.service';

type SequenceDatabase = Pick<Prisma.TransactionClient, '$queryRaw'>;

export interface AllocatedSequence {
  value: number;
  formatted: string;
}

interface AllocatedSequenceRow {
  value: number;
  prefix: string;
  padding: number;
}

const defaults: Record<
  SequenceType,
  { prefix: string; nextValue: number; padding: number }
> = {
  APPOINTMENT: { prefix: 'APT-', nextValue: 1, padding: 2 },
};

@Injectable()
export class SequenceService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Allocates the current nextValue and atomically advances it by one.
   * The optional transaction keeps allocation in the caller's transaction.
   */
  async next(
    tenantId: string,
    type: SequenceType,
    database: SequenceDatabase = this.prisma,
  ): Promise<AllocatedSequence> {
    const initial = defaults[type];
    const id = randomUUID();
    const rows = await database.$queryRaw<AllocatedSequenceRow[]>(Prisma.sql`
      INSERT INTO "Sequence" (
        "id", "tenantId", "type", "prefix", "nextValue", "padding", "createdAt", "updatedAt"
      )
      VALUES (
        ${id}::uuid,
        ${tenantId}::uuid,
        ${type}::"SequenceType",
        ${initial.prefix},
        ${initial.nextValue + 1},
        ${initial.padding},
        CURRENT_TIMESTAMP,
        CURRENT_TIMESTAMP
      )
      ON CONFLICT ("tenantId", "type") DO UPDATE
      SET "nextValue" = "Sequence"."nextValue" + 1,
          "updatedAt" = CURRENT_TIMESTAMP
      RETURNING
        "nextValue" - 1 AS "value",
        "prefix",
        "padding"
    `);
    const allocated = rows[0];
    if (!allocated) throw new Error('Sequence allocation returned no value');
    return {
      value: allocated.value,
      formatted: `${allocated.prefix}${String(allocated.value).padStart(allocated.padding, '0')}`,
    };
  }
}
