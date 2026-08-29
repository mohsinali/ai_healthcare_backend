import { Injectable, NotFoundException } from '@nestjs/common';
import { FAQStatus, Prisma, SequenceType } from '@prisma/client';
import { FieldValidationException } from '../common/validation/field-validation.exception';
import { PrismaService } from '../database/prisma.service';
import { SequenceService } from '../sequences/sequence.service';
import { TrustedTenantContext } from '../tenants/types/tenant-context';
import { CreateFaqDto, ListFaqsDto, UpdateFaqDto } from './dto/faq.dto';

const faqSelect = {
  id: true,
  faqNumber: true,
  locationId: true,
  location: { select: { id: true, locationNumber: true, name: true } },
  category: true,
  question: true,
  answer: true,
  keywords: true,
  status: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.FAQSelect;

@Injectable()
export class FaqsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly sequences: SequenceService,
  ) {}

  private normalizeKeywords(
    values: string[] | undefined,
  ): string[] | undefined {
    if (values === undefined) return undefined;
    const unique = new Map<string, string>();
    for (const value of values) {
      const trimmed = value.trim();
      if (trimmed && !unique.has(trimmed.toLocaleLowerCase()))
        unique.set(trimmed.toLocaleLowerCase(), trimmed);
    }
    return [...unique.values()];
  }

  private text(
    value: string | undefined,
    field: 'question' | 'answer',
  ): string | undefined {
    if (value === undefined) return undefined;
    const trimmed = value.trim();
    if (!trimmed)
      throw new FieldValidationException([
        {
          field,
          message: `${field === 'question' ? 'Question' : 'Answer'} is required.`,
        },
      ]);
    return trimmed;
  }

  private async assertLocation(
    tenantId: string,
    locationId: string | null | undefined,
  ) {
    if (!locationId) return;
    const location = await this.prisma.location.findFirst({
      where: { id: locationId, tenantId },
      select: { id: true },
    });
    if (!location) throw new NotFoundException('Location not found.');
  }

  private data(dto: CreateFaqDto | UpdateFaqDto) {
    const keywords = this.normalizeKeywords(dto.keywords);
    return {
      ...(dto.locationId !== undefined ? { locationId: dto.locationId } : {}),
      ...(dto.category !== undefined ? { category: dto.category } : {}),
      ...(dto.question !== undefined
        ? { question: this.text(dto.question, 'question') }
        : {}),
      ...(dto.answer !== undefined
        ? { answer: this.text(dto.answer, 'answer') }
        : {}),
      ...(keywords !== undefined
        ? {
            keywords,
            keywordSearchText: keywords.join('\n').toLocaleLowerCase(),
          }
        : {}),
    };
  }

  private where(
    tenantId: string,
    query: Pick<ListFaqsDto, 'search' | 'status' | 'category' | 'locationId'>,
    activeOnly = false,
  ): Prisma.FAQWhereInput {
    const search = query.search?.trim();
    return {
      tenantId,
      ...(activeOnly
        ? { status: FAQStatus.ACTIVE }
        : query.status
          ? { status: query.status }
          : {}),
      ...(query.category ? { category: query.category } : {}),
      ...(query.locationId ? { locationId: query.locationId } : {}),
      ...(search
        ? {
            OR: [
              { question: { contains: search, mode: 'insensitive' } },
              { answer: { contains: search, mode: 'insensitive' } },
              { keywordSearchText: { contains: search.toLocaleLowerCase() } },
            ],
          }
        : {}),
    };
  }

  async list(context: TrustedTenantContext, query: ListFaqsDto) {
    const where = this.where(context.tenantId, query);
    const [data, total] = await this.prisma.$transaction([
      this.prisma.fAQ.findMany({
        where,
        select: faqSelect,
        orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }],
        skip: (query.page - 1) * query.limit,
        take: query.limit,
      }),
      this.prisma.fAQ.count({ where }),
    ]);
    return {
      data,
      meta: {
        page: query.page,
        limit: query.limit,
        total,
        totalPages: Math.ceil(total / query.limit),
      },
    };
  }

  async get(context: TrustedTenantContext, id: string) {
    const faq = await this.prisma.fAQ.findFirst({
      where: { id, tenantId: context.tenantId },
      select: faqSelect,
    });
    if (!faq) throw new NotFoundException('FAQ not found.');
    return faq;
  }

  async create(context: TrustedTenantContext, dto: CreateFaqDto) {
    await this.assertLocation(context.tenantId, dto.locationId);
    const data = this.data(dto);
    return this.prisma.$transaction(async (transaction) => {
      const { formatted: faqNumber } = await this.sequences.next(
        context.tenantId,
        SequenceType.FAQ,
        transaction,
      );
      return transaction.fAQ.create({
        data: {
          ...data,
          tenantId: context.tenantId,
          faqNumber,
        } as Prisma.FAQUncheckedCreateInput,
        select: faqSelect,
      });
    });
  }

  async update(context: TrustedTenantContext, id: string, dto: UpdateFaqDto) {
    await this.get(context, id);
    await this.assertLocation(context.tenantId, dto.locationId);
    return this.prisma.fAQ.update({
      where: { tenantId_id: { tenantId: context.tenantId, id } },
      data: this.data(dto),
      select: faqSelect,
    });
  }

  async status(context: TrustedTenantContext, id: string, status: FAQStatus) {
    await this.get(context, id);
    return this.prisma.fAQ.update({
      where: { tenantId_id: { tenantId: context.tenantId, id } },
      data: { status },
      select: faqSelect,
    });
  }

  async searchApprovedFAQs(input: {
    tenantId: string;
    locationId?: string;
    query: string;
    limit?: number;
  }) {
    const searchWhere = this.where(
      input.tenantId,
      { search: input.query },
      true,
    );
    const where: Prisma.FAQWhereInput = input.locationId
      ? {
          AND: [
            searchWhere,
            { OR: [{ locationId: input.locationId }, { locationId: null }] },
          ],
        }
      : { AND: [searchWhere, { locationId: null }] };
    return this.prisma.fAQ.findMany({
      where,
      select: faqSelect,
      orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }],
      take: Math.min(input.limit ?? 10, 50),
    });
  }

  async searchApprovedFAQCandidates(input: {
    tenantId: string;
    locationId: string | null;
    terms: string[];
    limit?: number;
  }) {
    const terms = [
      ...new Set(input.terms.map((term) => term.trim()).filter(Boolean)),
    ];
    if (terms.length === 0) return [];
    return this.prisma.fAQ.findMany({
      where: {
        tenantId: input.tenantId,
        status: FAQStatus.ACTIVE,
        ...(input.locationId
          ? { OR: [{ locationId: input.locationId }, { locationId: null }] }
          : { locationId: null }),
        AND: [
          {
            OR: terms.flatMap((term) => [
              {
                question: {
                  contains: term,
                  mode: Prisma.QueryMode.insensitive,
                },
              },
              {
                answer: { contains: term, mode: Prisma.QueryMode.insensitive },
              },
              { keywordSearchText: { contains: term.toLocaleLowerCase() } },
            ]),
          },
        ],
      },
      select: {
        question: true,
        answer: true,
        keywords: true,
        locationId: true,
        updatedAt: true,
      },
      orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }],
      take: Math.min(input.limit ?? 50, 50),
    });
  }

  async hasApprovedLocationSpecificMatch(input: {
    tenantId: string;
    terms: string[];
  }): Promise<boolean> {
    const terms = [
      ...new Set(input.terms.map((term) => term.trim()).filter(Boolean)),
    ];
    if (terms.length === 0) return false;
    const count = await this.prisma.fAQ.count({
      where: {
        tenantId: input.tenantId,
        status: FAQStatus.ACTIVE,
        locationId: { not: null },
        OR: terms.flatMap((term) => [
          { question: { contains: term, mode: Prisma.QueryMode.insensitive } },
          { answer: { contains: term, mode: Prisma.QueryMode.insensitive } },
          { keywordSearchText: { contains: term.toLocaleLowerCase() } },
        ]),
      },
    });
    return count > 0;
  }
}
