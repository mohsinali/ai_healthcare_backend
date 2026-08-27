import {
  ConfigurationStatus,
  TenantStatus,
  WebVoiceChannelStatus,
} from '@prisma/client';
import { VoiceChannel } from '../voice/context/voice-context';
import { WebVoiceChannelResolverService } from './web-voice-channel-resolver.service';

describe('WebVoiceChannelResolverService', () => {
  const key = `wgt_${'a'.repeat(43)}`;
  const location = {
    id: 'location-a',
    name: 'Downtown',
    status: ConfigurationStatus.ACTIVE,
    timezone: 'UTC',
    escalationPhoneNumber: null,
  };
  const mapping = {
    id: 'channel-a',
    tenantId: 'tenant-a',
    locationId: 'location-a',
    agentId: 'agent_override',
    status: WebVoiceChannelStatus.ACTIVE,
    tenant: {
      id: 'tenant-a',
      name: 'Clinic',
      timezone: 'America/New_York',
      status: TenantStatus.ACTIVE,
    },
    location,
  };
  const create = (value: unknown = mapping, locations: unknown[] = []) => {
    const findUnique = jest.fn().mockResolvedValue(value);
    const findMany = jest.fn().mockResolvedValue(locations);
    return {
      service: new WebVoiceChannelResolverService({
        webVoiceChannel: { findUnique },
        location: { findMany },
      } as never),
      findUnique,
      findMany,
    };
  };

  it('resolves an explicitly assigned location into shared VoiceContext', async () => {
    const { service, findMany } = create();
    await expect(service.resolve(key)).resolves.toMatchObject({
      channel: VoiceChannel.WEB_WIDGET,
      tenantId: 'tenant-a',
      locationId: 'location-a',
      agentId: 'agent_override',
    });
    expect(findMany).not.toHaveBeenCalled();
  });

  it('auto-resolves exactly one active location', async () => {
    const { service } = create(
      { ...mapping, locationId: null, location: null },
      [location],
    );
    await expect(service.resolve(key)).resolves.toMatchObject({
      locationId: 'location-a',
      locationName: 'Downtown',
    });
  });

  it.each([[[]], [[location, { ...location, id: 'location-b' }]]])(
    'keeps zero or multiple locations tenant-wide',
    async (locations) => {
      const { service } = create(
        { ...mapping, locationId: null, location: null },
        locations,
      );
      await expect(service.resolve(key)).resolves.toMatchObject({
        locationId: null,
        locationName: null,
      });
    },
  );

  it('rejects malformed or unknown keys before trusting routing data', async () => {
    const { service, findUnique } = create(null);
    await expect(service.resolve('tenant-a')).resolves.toBeNull();
    expect(findUnique).not.toHaveBeenCalled();
    await expect(service.resolve(key)).resolves.toBeNull();
  });

  it.each([
    { status: WebVoiceChannelStatus.INACTIVE },
    { tenant: { ...mapping.tenant, status: TenantStatus.SUSPENDED } },
    { location: { ...location, status: ConfigurationStatus.INACTIVE } },
  ])(
    'rejects inactive channel, tenant, or explicit location',
    async (change) => {
      const { service } = create({ ...mapping, ...change });
      await expect(service.resolve(key)).resolves.toBeNull();
    },
  );
});
