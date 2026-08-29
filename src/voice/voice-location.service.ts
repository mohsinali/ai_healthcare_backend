import { Injectable } from '@nestjs/common';
import { ConfigurationStatus } from '@prisma/client';
import { PrismaService } from '../database/prisma.service';
import { VoiceContext } from './context/voice-context';

const MAX_RESULTS = 5;
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

    const caseInsensitiveExact = locations.filter(
      (location) =>
        location.name.toLocaleLowerCase() === query.toLocaleLowerCase(),
    );
    if (caseInsensitiveExact.length === 1)
      return resolved(caseInsensitiveExact[0]);

    const normalizedQuery = normalize(query);
    const normalizedExact = locations.filter(
      (location) => location.normalizedName === normalizedQuery,
    );
    if (normalizedExact.length === 1) return resolved(normalizedExact[0]);

    const partial = locations.filter((location) => {
      const name = location.normalizedName;
      return name.includes(normalizedQuery) || normalizedQuery.includes(name);
    });
    if (partial.length === 1) return resolved(partial[0]);
    if (partial.length > 1) {
      return {
        resolved: false,
        ambiguous: true,
        matches: partial.slice(0, MAX_RESULTS).map(summaryWithoutTimezone),
      };
    }
    return { resolved: false, ambiguous: false, matches: [] };
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

function normalize(value: string): string {
  return value
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();
}
