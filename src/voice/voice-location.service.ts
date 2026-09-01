import { Injectable } from '@nestjs/common';
import { ConfigurationStatus } from '@prisma/client';
import { PrismaService } from '../database/prisma.service';
import { VoiceContext } from './context/voice-context';

const MAX_RESULTS = 5;
const FUZZY_MIN_SIMILARITY = 0.85;
const FUZZY_MIN_MARGIN = 0.1;
const SPELLING_EQUIVALENTS: Readonly<Record<string, string>> = {
  centre: 'center',
};
const LIST_QUERY =
  /^(?:what|which|show|list|tell me)?\s*(?:clinic\s+)?(?:locations|branches)(?:\s+(?:do you have|are available|available))?\??$/i;

interface LocationSummary {
  key: string;
  name: string;
  timezone?: string;
}

interface LocationAddress {
  line1: string;
  line2: string | null;
  city: string;
  stateProvince: string;
  postalCode: string;
  country: string;
}

interface ResolvedLocation extends Required<LocationSummary> {
  address: LocationAddress;
}

export type VoiceLocationResponse =
  | { resolved: true; location: ResolvedLocation; matches: [] }
  | {
      resolved: false;
      ambiguous?: boolean;
      matches?: LocationSummary[];
      list?: LocationSummary[];
    };

@Injectable()
export class VoiceLocationService {
  constructor(private readonly prisma: PrismaService) {}

  async resolve(
    context: VoiceContext,
    query: string,
  ): Promise<VoiceLocationResponse> {
    const locations = await this.prisma.location.findMany({
      where: {
        tenantId: context.tenantId,
        status: ConfigurationStatus.ACTIVE,
      },
      select: {
        locationNumber: true,
        name: true,
        normalizedName: true,
        timezone: true,
        addressLine1: true,
        addressLine2: true,
        city: true,
        stateProvince: true,
        postalCode: true,
        countryCode: true,
      },
      orderBy: [{ name: 'asc' }, { locationNumber: 'asc' }],
    });

    if (LIST_QUERY.test(query.trim())) {
      return {
        resolved: false,
        list: locations.slice(0, MAX_RESULTS).map(summaryWithoutTimezone),
      };
    }

    const canonicalQuery = canonicalize(query);
    const candidates = locations.map((location) => ({
      location,
      canonicalName: canonicalize(location.name),
    }));
    const canonicalExact = candidates.filter(
      (candidate) => candidate.canonicalName === canonicalQuery,
    );
    if (canonicalExact.length === 1)
      return resolved(canonicalExact[0].location);
    if (canonicalExact.length > 1) {
      return {
        resolved: false,
        ambiguous: true,
        matches: canonicalExact
          .slice(0, MAX_RESULTS)
          .map(({ location }) => summaryWithoutTimezone(location)),
      };
    }

    const ranked = candidates
      .map(({ location, canonicalName }) => ({
        location,
        similarity: similarity(canonicalQuery, canonicalName),
      }))
      .sort(
        (left, right) =>
          right.similarity - left.similarity ||
          left.location.name.localeCompare(right.location.name) ||
          left.location.locationNumber.localeCompare(
            right.location.locationNumber,
          ),
      );
    const best = ranked[0];
    if (!best || best.similarity < FUZZY_MIN_SIMILARITY)
      return { resolved: false, ambiguous: false, matches: [] };

    const runnerUp = ranked[1];
    if (!runnerUp || best.similarity - runnerUp.similarity >= FUZZY_MIN_MARGIN)
      return resolved(best.location);

    const plausible = ranked.filter(
      (candidate) =>
        candidate.similarity >= FUZZY_MIN_SIMILARITY &&
        best.similarity - candidate.similarity < FUZZY_MIN_MARGIN,
    );
    return {
      resolved: false,
      ambiguous: true,
      matches: plausible
        .slice(0, MAX_RESULTS)
        .map(({ location }) => summaryWithoutTimezone(location)),
    };
  }
}

type LocationRecord = {
  locationNumber: string;
  name: string;
  normalizedName: string;
  timezone: string;
  addressLine1: string;
  addressLine2: string | null;
  city: string;
  stateProvince: string;
  postalCode: string;
  countryCode: string;
};

function resolved(location: LocationRecord): VoiceLocationResponse {
  return {
    resolved: true,
    location: {
      key: location.locationNumber,
      name: location.name,
      timezone: location.timezone,
      address: {
        line1: location.addressLine1,
        line2: location.addressLine2,
        city: location.city,
        stateProvince: location.stateProvince,
        postalCode: location.postalCode,
        country: location.countryCode,
      },
    },
    matches: [],
  };
}

function summaryWithoutTimezone(location: LocationRecord): LocationSummary {
  return { key: location.locationNumber, name: location.name };
}

function canonicalize(value: string): string {
  const normalized = value
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()
    .replace(/\s+/g, ' ');
  return normalized
    .split(' ')
    .map((word) => SPELLING_EQUIVALENTS[word] ?? word)
    .join(' ');
}

function similarity(left: string, right: string): number {
  const longestLength = Math.max(left.length, right.length);
  if (longestLength === 0) return 1;
  return 1 - levenshteinDistance(left, right) / longestLength;
}

function levenshteinDistance(left: string, right: string): number {
  let previous = Array.from({ length: right.length + 1 }, (_, index) => index);
  for (let leftIndex = 1; leftIndex <= left.length; leftIndex += 1) {
    const current = [leftIndex];
    for (let rightIndex = 1; rightIndex <= right.length; rightIndex += 1) {
      current[rightIndex] = Math.min(
        current[rightIndex - 1] + 1,
        previous[rightIndex] + 1,
        previous[rightIndex - 1] +
          (left[leftIndex - 1] === right[rightIndex - 1] ? 0 : 1),
      );
    }
    previous = current;
  }
  return previous[right.length];
}
