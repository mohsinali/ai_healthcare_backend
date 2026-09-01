import { Injectable } from '@nestjs/common';
import { ConfigurationStatus } from '@prisma/client';
import { AvailabilitySearchService } from '../appointments/availability-search.service';
import { PrismaService } from '../database/prisma.service';
import { VoiceContext } from './context/voice-context';
import { VoiceAvailabilitySearchDto } from './dto/voice-availability-search.dto';

type Status =
  | 'ok'
  | 'no_availability'
  | 'location_required'
  | 'service_not_found'
  | 'provider_not_found'
  | 'provider_not_qualified';

export interface VoiceAvailabilityResponse {
  status: Status;
  message: string;
  location?: { name: string; timezone: string };
  service?: { name: string; durationMinutes: number };
  requestedProvider?: string | null;
  slots: Array<{
    option: number;
    providerName: string;
    localDate: string;
    localTime: string;
    startsAt: string;
    endsAt: string;
  }>;
}

@Injectable()
export class VoiceAvailabilityService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly availability: AvailabilitySearchService,
  ) {}

  async search(
    context: VoiceContext,
    dto: VoiceAvailabilitySearchDto,
    locationId: string | null = context.locationId,
  ): Promise<VoiceAvailabilityResponse> {
    if (!locationId)
      return outcome(
        'location_required',
        'Select a clinic location before searching availability.',
      );
    const location = await this.prisma.location.findFirst({
      where: {
        id: locationId,
        tenantId: context.tenantId,
        status: ConfigurationStatus.ACTIVE,
      },
      select: { name: true, timezone: true },
    });
    if (!location)
      return outcome(
        'location_required',
        'Select an active clinic location before searching availability.',
      );

    const serviceName = dto.serviceName.trim();
    const service = await this.prisma.service.findFirst({
      where: {
        tenantId: context.tenantId,
        status: ConfigurationStatus.ACTIVE,
        durationMinutes: { gt: 0 },
        locationServices: { some: { tenantId: context.tenantId, locationId } },
        OR: [
          { name: { equals: serviceName, mode: 'insensitive' } },
          { normalizedName: normalize(serviceName) },
          { name: { contains: serviceName, mode: 'insensitive' } },
        ],
      },
      select: { id: true, name: true, durationMinutes: true },
      orderBy: [{ name: 'asc' }, { serviceNumber: 'asc' }],
    });
    if (!service)
      return outcome(
        'service_not_found',
        `The requested service is not configured at ${location.name}.`,
        location,
      );

    const providerName = dto.providerName?.trim();
    let providers: Array<{ id: string }>;
    if (providerName) {
      const providerTerms = normalize(providerName).split(/\s+/).slice(0, 12);
      const provider = await this.prisma.provider.findFirst({
        where: {
          tenantId: context.tenantId,
          status: ConfigurationStatus.ACTIVE,
          providerLocations: {
            some: { tenantId: context.tenantId, locationId },
          },
          AND: providerTerms.map((term) => ({
            OR: [
              { firstName: { contains: term, mode: 'insensitive' as const } },
              { lastName: { contains: term, mode: 'insensitive' as const } },
              { displayName: { contains: term, mode: 'insensitive' as const } },
              { title: { contains: term, mode: 'insensitive' as const } },
            ],
          })),
        },
        select: {
          id: true,
          providerServices: {
            where: { tenantId: context.tenantId, serviceId: service.id },
            select: { id: true },
          },
        },
        orderBy: [
          { lastName: 'asc' },
          { firstName: 'asc' },
          { providerNumber: 'asc' },
        ],
      });
      if (!provider)
        return outcome(
          'provider_not_found',
          `The requested provider was not found at ${location.name}.`,
          location,
          service,
          providerName,
        );
      if (!provider.providerServices.length)
        return outcome(
          'provider_not_qualified',
          `${providerName} is not associated with ${service.name}.`,
          location,
          service,
          providerName,
        );
      providers = [provider];
    } else {
      providers = await this.prisma.provider.findMany({
        where: {
          tenantId: context.tenantId,
          status: ConfigurationStatus.ACTIVE,
          providerLocations: {
            some: { tenantId: context.tenantId, locationId },
          },
          providerServices: {
            some: { tenantId: context.tenantId, serviceId: service.id },
          },
        },
        select: { id: true },
      });
    }

    const result = await this.availability.search({
      tenantId: context.tenantId,
      locationId,
      serviceId: service.id,
      providerIds: providers.map(({ id }) => id),
      startDate: dto.startDate,
      endDate: dto.endDate,
      timeOfDay: dto.timeOfDay,
    });
    const slots = result.slots.map((slot, index) => ({
      option: index + 1,
      providerName: slot.providerName,
      localDate: slot.localDate,
      localTime: slot.localTime,
      startsAt: slot.startsAt,
      endsAt: slot.endsAt,
    }));
    return {
      status: slots.length ? 'ok' : 'no_availability',
      message: slots.length
        ? `${numberWord(slots.length)} appointment time${slots.length === 1 ? ' was' : 's were'} found.`
        : `No appointment times were found for ${service.name} in the requested range.`,
      location: result.location,
      service: result.service,
      requestedProvider: providerName ?? null,
      slots,
    };
  }
}

function outcome(
  status: Exclude<Status, 'ok' | 'no_availability'>,
  message: string,
  location?: { name: string; timezone: string },
  service?: { name: string; durationMinutes: number },
  requestedProvider?: string,
): VoiceAvailabilityResponse {
  return {
    status,
    message,
    ...(location ? { location } : {}),
    ...(service ? { service } : {}),
    ...(requestedProvider ? { requestedProvider } : {}),
    slots: [],
  };
}

function normalize(value: string) {
  return value
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();
}

function numberWord(value: number) {
  return (
    ['Zero', 'One', 'Two', 'Three', 'Four', 'Five'][value] ?? String(value)
  );
}
