import { Injectable } from '@nestjs/common';
import { FaqsService } from '../faqs/faqs.service';
import { VoiceContext } from './context/voice-context';

const MAX_MATCHES = 3;
const STOP_WORDS = new Set([
  'a',
  'an',
  'and',
  'are',
  'at',
  'be',
  'can',
  'do',
  'does',
  'for',
  'have',
  'i',
  'in',
  'is',
  'it',
  'me',
  'my',
  'of',
  'on',
  'the',
  'to',
  'what',
  'when',
  'where',
  'which',
  'with',
  'you',
  'your',
]);

export interface VoiceFaqSearchResponse {
  found: boolean;
  matches: Array<{
    question: string;
    answer: string;
    scope: 'TENANT' | 'LOCATION';
  }>;
  requiresLocation?: boolean;
}

@Injectable()
export class VoiceFaqService {
  constructor(private readonly faqs: FaqsService) {}

  async search(
    context: VoiceContext,
    query: string,
    locationId: string | null = context.locationId,
  ): Promise<VoiceFaqSearchResponse> {
    const normalizedQuery = normalize(query);
    const terms = searchTerms(normalizedQuery);
    const candidates = await this.faqs.searchApprovedFAQCandidates({
      tenantId: context.tenantId,
      locationId,
      terms,
    });
    const matches = candidates
      .map((faq) => ({ faq, score: score(faq, normalizedQuery, terms) }))
      .filter(({ score: relevance }) => relevance > 0)
      .sort(
        (left, right) =>
          right.score - left.score ||
          right.faq.updatedAt.getTime() - left.faq.updatedAt.getTime() ||
          left.faq.question.localeCompare(right.faq.question),
      )
      .slice(0, MAX_MATCHES)
      .map(({ faq }) => ({
        question: faq.question,
        answer: faq.answer,
        scope: faq.locationId ? ('LOCATION' as const) : ('TENANT' as const),
      }));

    if (matches.length > 0) return { found: true, matches };
    if (
      !locationId &&
      (await this.faqs.hasApprovedLocationSpecificMatch({
        tenantId: context.tenantId,
        terms,
      }))
    ) {
      return { found: false, matches: [], requiresLocation: true };
    }
    return { found: false, matches: [] };
  }
}

function normalize(value: string): string {
  return value
    .toLocaleLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();
}

function searchTerms(query: string): string[] {
  const meaningful = query
    .split(/\s+/)
    .filter((term) => term.length > 1 && !STOP_WORDS.has(term));
  return meaningful.length > 0 ? meaningful.slice(0, 12) : [query];
}

function score(
  faq: { question: string; answer: string; keywords: string[] },
  query: string,
  terms: string[],
): number {
  const question = normalize(faq.question);
  const answer = normalize(faq.answer);
  const keywords = faq.keywords.map(normalize);
  let result = question.includes(query) ? 100 : 0;
  if (answer.includes(query)) result += 40;
  if (keywords.some((keyword) => keyword === query)) result += 120;
  for (const term of terms) {
    if (keywords.some((keyword) => keyword === term)) result += 30;
    else if (keywords.some((keyword) => keyword.includes(term))) result += 20;
    if (question.includes(term)) result += 12;
    if (answer.includes(term)) result += 4;
  }
  return result;
}
