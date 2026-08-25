import { NotFoundException } from '@nestjs/common';
import { FAQCategory, FAQStatus, SequenceType } from '@prisma/client';
import { FaqsService } from './faqs.service';

/* Jest's intentionally dynamic Prisma boundary uses untyped callback payloads. */
/* eslint-disable @typescript-eslint/no-unsafe-return, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access */

describe('FaqsService', () => {
  const tenantId = '11111111-1111-4111-8111-111111111111';
  const locationId = '22222222-2222-4222-8222-222222222222';
  const context = { tenantId } as never;
  const dto = {
    category: FAQCategory.PARKING,
    question: '  Is parking available?  ',
    answer: '  Free parking is behind the clinic.  ',
    keywords: [' Parking ', 'car park', 'PARKING', '  '],
  };

  it('derives ownership and number while normalizing approved content', async () => {
    const create = jest.fn().mockImplementation(({ data }) => ({
      ...data,
      status: FAQStatus.ACTIVE,
    }));
    const transaction = { fAQ: { create }, $queryRaw: jest.fn() };
    const prisma = {
      location: { findFirst: jest.fn() },
      $transaction: jest.fn((callback) => callback(transaction)),
    } as never;
    const next = jest.fn().mockResolvedValue({ value: 1, formatted: 'FAQ-01' });

    const result = await new FaqsService(prisma, { next } as never).create(
      context,
      dto,
    );

    expect(next).toHaveBeenCalledWith(tenantId, SequenceType.FAQ, transaction);
    expect(result).toMatchObject({
      tenantId,
      faqNumber: 'FAQ-01',
      status: FAQStatus.ACTIVE,
      question: 'Is parking available?',
      answer: 'Free parking is behind the clinic.',
      keywords: ['Parking', 'car park'],
      keywordSearchText: 'parking\ncar park',
    });
  });

  it('allows tenant-wide scope without a location lookup', async () => {
    const findFirst = jest.fn();
    const transaction = {
      fAQ: { create: jest.fn().mockResolvedValue({ locationId: null }) },
    };
    const prisma = {
      location: { findFirst },
      $transaction: jest.fn((callback) => callback(transaction)),
    } as never;
    await new FaqsService(prisma, {
      next: jest.fn().mockResolvedValue({ formatted: 'FAQ-01' }),
    } as never).create(context, { ...dto, locationId: null });
    expect(findFirst).not.toHaveBeenCalled();
  });

  it('rejects a cross-tenant location before allocating a number', async () => {
    const next = jest.fn();
    const prisma = {
      location: { findFirst: jest.fn().mockResolvedValue(null) },
    } as never;
    await expect(
      new FaqsService(prisma, { next } as never).create(context, {
        ...dto,
        locationId,
      }),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(next).not.toHaveBeenCalled();
  });

  it('tenant-scopes list filters and partial search across all fields', async () => {
    const findMany = jest.fn().mockResolvedValue([]);
    const count = jest.fn().mockResolvedValue(0);
    const prisma = {
      fAQ: { findMany, count },
      $transaction: jest.fn((queries) => Promise.all(queries)),
    } as never;
    await new FaqsService(prisma, {} as never).list(context, {
      page: 2,
      limit: 5,
      search: ' AET ',
      category: FAQCategory.INSURANCE,
      status: FAQStatus.INACTIVE,
      locationId,
    });
    const args = findMany.mock.calls[0][0] as {
      where: Record<string, unknown>;
      skip: number;
      take: number;
    };
    expect(args.where).toMatchObject({
      tenantId,
      category: FAQCategory.INSURANCE,
      status: FAQStatus.INACTIVE,
      locationId,
    });
    expect(args.where.OR).toEqual([
      { question: { contains: 'AET', mode: 'insensitive' } },
      { answer: { contains: 'AET', mode: 'insensitive' } },
      { keywordSearchText: { contains: 'aet' } },
    ]);
    expect(args).toMatchObject({ skip: 5, take: 5 });
    expect(count).toHaveBeenCalledWith({ where: args.where });
  });

  it('hides another tenant FAQ as not found', async () => {
    const findFirst = jest.fn().mockResolvedValue(null);
    const prisma = { fAQ: { findFirst } } as never;
    await expect(
      new FaqsService(prisma, {} as never).get(context, 'foreign-id'),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'foreign-id', tenantId } }),
    );
  });

  it('updates mutable fields without writing tenantId or faqNumber', async () => {
    const existing = { id: 'faq-id', faqNumber: 'FAQ-01' };
    const update = jest
      .fn()
      .mockResolvedValue({ ...existing, question: 'Updated' });
    const prisma = {
      fAQ: { findFirst: jest.fn().mockResolvedValue(existing), update },
      location: { findFirst: jest.fn() },
    } as never;
    await new FaqsService(prisma, {} as never).update(context, 'faq-id', {
      question: ' Updated ',
    });
    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { tenantId_id: { tenantId, id: 'faq-id' } },
        data: { question: 'Updated' },
      }),
    );
  });

  it('enforces ACTIVE and location/global scope for future retrieval', async () => {
    const findMany = jest.fn().mockResolvedValue([]);
    const prisma = { fAQ: { findMany } } as never;
    await new FaqsService(prisma, {} as never).searchApprovedFAQs({
      tenantId,
      locationId,
      query: 'parking',
      limit: 5,
    });
    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          AND: [
            expect.objectContaining({
              tenantId,
              status: FAQStatus.ACTIVE,
            }),
            { OR: [{ locationId }, { locationId: null }] },
          ],
        },
        take: 5,
      }),
    );
  });
});
