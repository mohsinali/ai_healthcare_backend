import { ConfigurationStatus } from '@prisma/client';
import { VoiceLocationService } from './voice-location.service';

describe('VoiceLocationService', () => {
  const context = { tenantId: 'trusted-tenant' };
  const locations = [
    {
      locationNumber: 'LOC-001',
      name: 'Clifton',
      normalizedName: 'clifton',
      timezone: 'Asia/Karachi',
      addressLine1: '12 Main Road',
      addressLine2: null,
      city: 'Karachi',
      stateProvince: 'Sindh',
      postalCode: '75600',
      countryCode: 'PK',
    },
    {
      locationNumber: 'LOC-002',
      name: 'Northside Clinic',
      normalizedName: 'northside clinic',
      timezone: 'Asia/Karachi',
      addressLine1: '45 North Avenue',
      addressLine2: 'Second Floor',
      city: 'Karachi',
      stateProvince: 'Sindh',
      postalCode: '75300',
      countryCode: 'PK',
    },
  ];

  function create(rows: Array<Record<string, unknown>> = locations) {
    const findMany = jest.fn().mockResolvedValue(rows);
    return {
      service: new VoiceLocationService({ location: { findMany } } as never),
      findMany,
    };
  }

  it('makes inactive and other-tenant locations inaccessible', async () => {
    const { service, findMany } = create();
    await service.resolve(context as never, 'Clifton');
    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          tenantId: 'trusted-tenant',
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
      }),
    );
  });

  it.each(['Clifton', 'clifton', 'Clifton clinic'])(
    'resolves exact, case-insensitive, and unique partial query %s',
    async (query) => {
      const { service } = create();
      await expect(service.resolve(context as never, query)).resolves.toEqual({
        resolved: true,
        location: {
          key: 'LOC-001',
          name: 'Clifton',
          timezone: 'Asia/Karachi',
          address: {
            line1: '12 Main Road',
            line2: null,
            city: 'Karachi',
            stateProvince: 'Sindh',
            postalCode: '75600',
            country: 'PK',
          },
        },
        matches: [],
      });
    },
  );

  it('returns safe address fields for normalized exact and unique partial matches', async () => {
    const { service } = create();
    for (const query of ['Northside--Clinic', 'Northside']) {
      const result = await service.resolve(context as never, query);
      expect(result).toMatchObject({
        resolved: true,
        location: {
          key: 'LOC-002',
          name: 'Northside Clinic',
          timezone: 'Asia/Karachi',
          address: {
            line1: '45 North Avenue',
            line2: 'Second Floor',
            city: 'Karachi',
            stateProvince: 'Sindh',
            postalCode: '75300',
            country: 'PK',
          },
        },
      });
    }
  });

  it('does not expose database or internal fields from a resolved record', async () => {
    const { service } = create([
      {
        ...locations[0],
        id: 'database-uuid',
        tenantId: 'trusted-tenant',
        createdAt: new Date(),
        updatedAt: new Date(),
        escalationPhoneNumber: '+15550000000',
      },
    ]);
    const result = await service.resolve(context as never, 'Clifton');
    expect(result).toEqual({
      resolved: true,
      location: {
        key: 'LOC-001',
        name: 'Clifton',
        timezone: 'Asia/Karachi',
        address: {
          line1: '12 Main Road',
          line2: null,
          city: 'Karachi',
          stateProvince: 'Sindh',
          postalCode: '75600',
          country: 'PK',
        },
      },
      matches: [],
    });
    expect(JSON.stringify(result)).not.toMatch(
      /database-uuid|tenantId|createdAt|updatedAt|escalationPhoneNumber/,
    );
  });

  it('returns a small ambiguous list without UUIDs', async () => {
    const { service } = create([
      {
        ...locations[0],
        name: 'Clifton North',
        normalizedName: 'clifton north',
      },
      {
        ...locations[1],
        name: 'Clifton South',
        normalizedName: 'clifton south',
      },
    ]);
    await expect(service.resolve(context as never, 'Clifton')).resolves.toEqual(
      {
        resolved: false,
        ambiguous: true,
        matches: [
          { key: 'LOC-001', name: 'Clifton North' },
          { key: 'LOC-002', name: 'Clifton South' },
        ],
      },
    );
  });

  it('keeps list results compact even when full location details are available', async () => {
    const { service } = create();
    const result = await service.resolve(
      context as never,
      'Which locations do you have?',
    );
    expect(result).toEqual({
      resolved: false,
      list: [
        { key: 'LOC-001', name: 'Clifton' },
        { key: 'LOC-002', name: 'Northside Clinic' },
      ],
    });
    expect(JSON.stringify(result)).not.toMatch(
      /"address"|"timezone"|"tenantId"|"id"/,
    );
  });

  it('returns an explicit miss and supports listing through the same tool', async () => {
    const { service } = create();
    await expect(service.resolve(context as never, 'Gulshan')).resolves.toEqual(
      {
        resolved: false,
        ambiguous: false,
        matches: [],
      },
    );
    await expect(
      service.resolve(context as never, 'Which locations do you have?'),
    ).resolves.toEqual({
      resolved: false,
      list: [
        { key: 'LOC-001', name: 'Clifton' },
        { key: 'LOC-002', name: 'Northside Clinic' },
      ],
    });
  });
});
