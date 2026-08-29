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
    },
    {
      locationNumber: 'LOC-002',
      name: 'Northside Clinic',
      normalizedName: 'northside clinic',
      timezone: 'Asia/Karachi',
    },
  ];

  function create(rows = locations) {
    const findMany = jest.fn().mockResolvedValue(rows);
    return {
      service: new VoiceLocationService({ location: { findMany } } as never),
      findMany,
    };
  }

  it('queries only active locations in the trusted tenant', async () => {
    const { service, findMany } = create();
    await service.resolve(context as never, 'Clifton');
    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          tenantId: 'trusted-tenant',
          status: ConfigurationStatus.ACTIVE,
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
        },
        matches: [],
      });
    },
  );

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
