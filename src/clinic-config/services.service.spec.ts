import { ServicesService } from './services.service';

describe('ServicesService', () => {
  it('assigns a service number during creation', async () => {
    const create = jest.fn((args: { data: Record<string, unknown> }) =>
      Promise.resolve(args.data),
    );
    const service = new ServicesService(
      { service: { create } } as never,
      {
        next: jest.fn().mockResolvedValue({ formatted: 'SRV-01', value: 1 }),
      } as never,
    );
    await expect(
      service.create({ tenantId: 'tenant-a' } as never, {
        name: 'Consultation',
        durationMinutes: 30,
      }),
    ).resolves.toMatchObject({ serviceNumber: 'SRV-01' });
  });
});
