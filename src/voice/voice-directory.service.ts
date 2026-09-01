import { Injectable } from '@nestjs/common';
import { ConfigurationStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../database/prisma.service';
import { VoiceContext } from './context/voice-context';

const MAX_RESULTS = 10;

type ToolStatus = 'ok' | 'no_match' | 'location_required';

export interface VoiceServiceSearchResponse {
  status: ToolStatus;
  message: string;
  location?: { name: string };
  services: Array<{
    name: string;
    description: string | null;
    durationMinutes: number;
  }>;
}

export interface VoiceProviderSearchResponse {
  status: ToolStatus | 'service_not_found';
  message: string;
  location?: { name: string };
  providers: Array<{
    name: string;
    services: string[];
  }>;
}

@Injectable()
export class VoiceDirectoryService {
  constructor(private readonly prisma: PrismaService) {}

  async searchServices(
    context: VoiceContext,
    query?: string,
    locationId: string | null = context.locationId,
  ): Promise<VoiceServiceSearchResponse> {
    if (!locationId) return locationRequired('services');
    const location = await this.activeLocation(context.tenantId, locationId);
    if (!location) return locationRequired('services');
    const term = query?.trim();
    const terms = term ? searchTerms(term) : [];
    const textFilter: Prisma.ServiceWhereInput | undefined = term
      ? {
          OR: terms.flatMap((searchTerm) => [
            { name: { contains: searchTerm, mode: 'insensitive' as const } },
            {
              description: {
                contains: searchTerm,
                mode: 'insensitive' as const,
              },
            },
          ]),
        }
      : undefined;
    const services = await this.prisma.service.findMany({
      where: {
        tenantId: context.tenantId,
        status: ConfigurationStatus.ACTIVE,
        locationServices: {
          some: { tenantId: context.tenantId, locationId },
        },
        ...textFilter,
      },
      select: { name: true, description: true, durationMinutes: true },
      orderBy: [{ name: 'asc' }, { serviceNumber: 'asc' }],
      take: MAX_RESULTS,
    });
    return {
      status: services.length ? 'ok' : 'no_match',
      message: services.length
        ? `Found ${services.length} configured service${services.length === 1 ? '' : 's'} at ${location.name}.`
        : `No configured services matched${term ? ` "${term}"` : ''} at ${location.name}.`,
      location,
      services,
    };
  }

  async searchProviders(
    context: VoiceContext,
    input: { query?: string; serviceName?: string },
    locationId: string | null = context.locationId,
  ): Promise<VoiceProviderSearchResponse> {
    if (!locationId) return providerLocationRequired();
    const location = await this.activeLocation(context.tenantId, locationId);
    if (!location) return providerLocationRequired();

    const serviceName = input.serviceName?.trim();
    let serviceId: string | undefined;
    if (serviceName) {
      const service = await this.prisma.service.findFirst({
        where: {
          tenantId: context.tenantId,
          status: ConfigurationStatus.ACTIVE,
          locationServices: {
            some: { tenantId: context.tenantId, locationId },
          },
          OR: [
            { name: { equals: serviceName, mode: 'insensitive' } },
            { name: { contains: serviceName, mode: 'insensitive' } },
            { normalizedName: normalize(serviceName) },
          ],
        },
        select: { id: true },
        orderBy: [{ name: 'asc' }, { serviceNumber: 'asc' }],
      });
      if (!service) {
        return {
          status: 'service_not_found',
          message: `The requested service is not configured at ${location.name}.`,
          location,
          providers: [],
        };
      }
      serviceId = service.id;
    }

    const query = input.query?.trim();
    const providers = await this.prisma.provider.findMany({
      where: {
        tenantId: context.tenantId,
        status: ConfigurationStatus.ACTIVE,
        providerLocations: {
          some: { tenantId: context.tenantId, locationId },
        },
        ...(query
          ? {
              OR: [
                { firstName: { contains: query, mode: 'insensitive' } },
                { lastName: { contains: query, mode: 'insensitive' } },
                { displayName: { contains: query, mode: 'insensitive' } },
                { title: { contains: query, mode: 'insensitive' } },
              ],
            }
          : {}),
        ...(serviceId
          ? {
              providerServices: {
                some: { tenantId: context.tenantId, serviceId },
              },
            }
          : {}),
      },
      select: {
        firstName: true,
        lastName: true,
        displayName: true,
        title: true,
        providerServices: {
          where: {
            tenantId: context.tenantId,
            service: {
              status: ConfigurationStatus.ACTIVE,
              locationServices: {
                some: { tenantId: context.tenantId, locationId },
              },
            },
          },
          select: { service: { select: { name: true } } },
          orderBy: { service: { name: 'asc' } },
        },
      },
      orderBy: [
        { lastName: 'asc' },
        { firstName: 'asc' },
        { providerNumber: 'asc' },
      ],
      take: MAX_RESULTS,
    });
    const safeProviders = providers.map((provider) => ({
      name:
        provider.displayName ??
        [provider.title, provider.firstName, provider.lastName]
          .filter(Boolean)
          .join(' '),
      services: provider.providerServices.map(({ service }) => service.name),
    }));
    return {
      status: safeProviders.length ? 'ok' : 'no_match',
      message: safeProviders.length
        ? `Found ${safeProviders.length} configured provider${safeProviders.length === 1 ? '' : 's'} at ${location.name}.`
        : serviceName
          ? `The service is configured at ${location.name}, but no providers are associated with it there.`
          : `No configured providers matched${query ? ` "${query}"` : ''} at ${location.name}.`,
      location,
      providers: safeProviders,
    };
  }

  private activeLocation(tenantId: string, locationId: string) {
    return this.prisma.location.findFirst({
      where: { id: locationId, tenantId, status: ConfigurationStatus.ACTIVE },
      select: { name: true },
    });
  }
}

function locationRequired(subject: string): VoiceServiceSearchResponse {
  return {
    status: 'location_required',
    message: `Select a clinic location before searching ${subject}.`,
    services: [],
  };
}

function providerLocationRequired(): VoiceProviderSearchResponse {
  return {
    status: 'location_required',
    message: 'Select a clinic location before searching providers.',
    providers: [],
  };
}

function normalize(value: string): string {
  return value
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();
}

const STOP_WORDS = new Set([
  'a',
  'about',
  'do',
  'does',
  'for',
  'have',
  'is',
  'me',
  'provide',
  'tell',
  'the',
  'you',
]);

function searchTerms(value: string): string[] {
  const normalized = normalize(value);
  const meaningful = normalized
    .split(/\s+/)
    .filter((term) => term.length > 1 && !STOP_WORDS.has(term));
  return meaningful.length ? meaningful.slice(0, 12) : [normalized];
}
