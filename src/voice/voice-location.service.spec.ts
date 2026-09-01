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
  const qureshi = {
    ...locations[0],
    locationNumber: 'LOC-003',
    name: 'Qureshi Medical Centre',
    normalizedName: 'qureshi medical centre',
  };

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

  it.each(['Clifton', 'clifton', '  CLIFTON  '])(
    'resolves exact canonical and case-insensitive query %s',
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

  it('returns safe address fields for normalized punctuation differences', async () => {
    const { service } = create();
    for (const query of ['Northside--Clinic', ' Northside   Clinic ']) {
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

  it.each([
    'Qureshi Medical Center',
    'Qureshi Medical Centre',
    'qureshi medical CENTER',
    '  Qureshi   Medical, Center!  ',
  ])(
    'canonicalizes safe spelling and formatting variants: %s',
    async (query) => {
      const { service } = create([qureshi]);
      await expect(
        service.resolve(context as never, query),
      ).resolves.toMatchObject({
        resolved: true,
        location: { key: 'LOC-003', name: 'Qureshi Medical Centre' },
      });
    },
  );

  it('canonicalizes Centre to Center in the opposite stored spelling direction', async () => {
    const { service } = create([
      { ...qureshi, name: 'Qureshi Medical Center' },
    ]);
    await expect(
      service.resolve(context as never, 'Qureshi Medical Centre'),
    ).resolves.toMatchObject({
      resolved: true,
      location: { name: 'Qureshi Medical Center' },
    });
  });

  it('resolves a unique high-confidence full-name typo', async () => {
    const { service } = create([qureshi, locations[1]]);
    await expect(
      service.resolve(context as never, 'Qureshi Medcal Centre'),
    ).resolves.toMatchObject({
      resolved: true,
      location: { key: 'LOC-003' },
    });
  });

  it('gives a canonical exact match precedence over fuzzy candidates', async () => {
    const { service } = create([
      qureshi,
      {
        ...locations[1],
        locationNumber: 'LOC-004',
        name: 'Qureshi Medical Centers',
        normalizedName: 'qureshi medical centers',
      },
    ]);
    await expect(
      service.resolve(context as never, 'Qureshi Medical Center'),
    ).resolves.toMatchObject({
      resolved: true,
      location: { key: 'LOC-003' },
    });
  });

  it('does not resolve low-confidence or partial-name queries', async () => {
    const { service } = create([qureshi]);
    await expect(service.resolve(context as never, 'Qureshi')).resolves.toEqual(
      {
        resolved: false,
        ambiguous: false,
        matches: [],
      },
    );
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

  it('returns similarly plausible fuzzy matches as a safe ambiguous list', async () => {
    const { service } = create([
      {
        ...locations[0],
        name: 'Qureshi Medical Centre North',
        normalizedName: 'qureshi medical centre north',
      },
      {
        ...locations[1],
        name: 'Qureshi Medical Centre South',
        normalizedName: 'qureshi medical centre south',
      },
    ]);
    const result = await service.resolve(
      context as never,
      'Qureshi Medical Centre Mouth',
    );
    expect(result).toEqual({
      resolved: false,
      ambiguous: true,
      matches: [
        { key: 'LOC-002', name: 'Qureshi Medical Centre South' },
        { key: 'LOC-001', name: 'Qureshi Medical Centre North' },
      ],
    });
    expect(JSON.stringify(result)).not.toMatch(/similarity|database-uuid/);
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
