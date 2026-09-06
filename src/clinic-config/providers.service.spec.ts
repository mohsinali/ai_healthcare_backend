import { BadRequestException, NotFoundException } from '@nestjs/common';
import { DayOfWeek, Prisma } from '@prisma/client';
import { FieldValidationException } from '../common/validation/field-validation.exception';
import { ProvidersService } from './providers.service';
import { scheduleConflictCodes } from './scheduling-invariants';

describe('ProvidersService', () => {
  it('searches all provider name and title fields case-insensitively', async () => {
    const findMany = jest.fn().mockResolvedValue([]);
    const count = jest.fn().mockResolvedValue(0);
    const prisma = {
      provider: { findMany, count },
      $transaction: jest.fn((operations: Promise<unknown>[]) =>
        Promise.all(operations),
      ),
    };
    const service = new ProvidersService(prisma as never, {} as never);

    await expect(
      service.list({ tenantId: 'tenant-a' } as never, {
        page: 2,
        limit: 10,
        search: '  Cardio  ',
      }),
    ).resolves.toEqual({
      data: [],
      meta: { page: 2, limit: 10, total: 0, totalPages: 0 },
    });

    const where = {
      tenantId: 'tenant-a',
      OR: [
        { firstName: { contains: 'Cardio', mode: 'insensitive' } },
        { lastName: { contains: 'Cardio', mode: 'insensitive' } },
        { displayName: { contains: 'Cardio', mode: 'insensitive' } },
        { title: { contains: 'Cardio', mode: 'insensitive' } },
        { providerNumber: { contains: 'Cardio', mode: 'insensitive' } },
      ],
    };
    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where, skip: 10, take: 10 }),
    );
    expect(count).toHaveBeenCalledWith({ where });
  });

  it('assigns a provider number during creation', async () => {
    const create = jest.fn((args: { data: Record<string, unknown> }) =>
      Promise.resolve(args.data),
    );
    const service = new ProvidersService(
      { provider: { create } } as never,
      {
        next: jest.fn().mockResolvedValue({ formatted: 'PRV-01', value: 1 }),
      } as never,
    );
    await expect(
      service.create({ tenantId: 'tenant-a' } as never, {
        firstName: 'Ada',
        lastName: 'Lovelace',
      }),
    ).resolves.toMatchObject({ providerNumber: 'PRV-01' });
  });

  it('associates an invalid provider phone with the phone field', async () => {
    const prisma = { provider: { create: jest.fn() } };
    const service = new ProvidersService(prisma as never, {} as never);

    const promise = service.create({ tenantId: 'tenant-a' } as never, {
      firstName: 'Ada',
      lastName: 'Lovelace',
      phone: 'asdfasdf',
    });
    await expect(promise).rejects.toBeInstanceOf(FieldValidationException);
    await expect(promise).rejects.toMatchObject({
      response: {
        message: 'Validation failed.',
        errors: [
          {
            field: 'phone',
            message: 'Enter a valid international phone number.',
          },
        ],
      },
    });
    expect(prisma.provider.create).not.toHaveBeenCalled();
  });

  describe('working periods', () => {
    const context = { tenantId: 'tenant-a' } as never;

    it('returns every assigned location with calendar-ordered hours and periods', async () => {
      const prisma = {
        provider: { findFirst: jest.fn().mockResolvedValue({ id: 'p1' }) },
        providerLocation: {
          findMany: jest.fn().mockResolvedValue([
            {
              location: {
                id: 'l1',
                name: 'Main',
                timezone: 'UTC',
                status: 'ACTIVE',
                businessHours: [
                  { dayOfWeek: DayOfWeek.SUNDAY },
                  { dayOfWeek: DayOfWeek.MONDAY },
                ],
              },
              providerWorkingPeriods: [
                {
                  dayOfWeek: DayOfWeek.TUESDAY,
                  startTime: '16:00',
                  endTime: '17:00',
                },
                {
                  dayOfWeek: DayOfWeek.MONDAY,
                  startTime: '10:00',
                  endTime: '14:00',
                },
                {
                  dayOfWeek: DayOfWeek.TUESDAY,
                  startTime: '09:00',
                  endTime: '12:00',
                },
              ],
            },
            {
              location: {
                id: 'l2',
                name: 'North',
                timezone: 'UTC',
                status: 'ACTIVE',
                businessHours: [],
              },
              providerWorkingPeriods: [],
            },
          ]),
        },
      };
      const service = new ProvidersService(prisma as never, {} as never);

      const result = await service.workingPeriods(context, 'p1');

      expect(result[0].businessHours.map((hour) => hour.dayOfWeek)).toEqual([
        DayOfWeek.MONDAY,
        DayOfWeek.SUNDAY,
      ]);
      expect(result[0].periods.map((period) => period.startTime)).toEqual([
        '10:00',
        '09:00',
        '16:00',
      ]);
      expect(result[1].periods).toEqual([]);
      expect(prisma.providerLocation.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { tenantId: 'tenant-a', providerId: 'p1' },
        }),
      );
    });

    it('rejects a missing or cross-tenant provider without reading assignments', async () => {
      const findMany = jest.fn();
      const service = new ProvidersService(
        {
          provider: { findFirst: jest.fn().mockResolvedValue(null) },
          providerLocation: { findMany },
        } as never,
        {} as never,
      );

      await expect(service.workingPeriods(context, 'foreign')).rejects.toThrow(
        new NotFoundException('Provider not found.'),
      );
      expect(findMany).not.toHaveBeenCalled();
    });

    it('atomically replaces only the selected provider-location schedule', async () => {
      const tx = {
        $executeRaw: jest.fn(),
        provider: { findFirst: jest.fn().mockResolvedValue({ id: 'p1' }) },
        location: {
          findFirst: jest.fn().mockResolvedValue({
            id: 'l1',
            status: 'ACTIVE',
            businessHours: [
              {
                dayOfWeek: DayOfWeek.MONDAY,
                isClosed: false,
                openTime: '09:00',
                closeTime: '17:00',
              },
            ],
          }),
        },
        providerLocation: {
          findFirst: jest.fn().mockResolvedValue({ id: 'assignment' }),
        },
        providerWorkingPeriod: {
          deleteMany: jest.fn(),
          createMany: jest.fn(),
          findMany: jest.fn().mockResolvedValue([
            {
              dayOfWeek: DayOfWeek.MONDAY,
              startTime: '10:00',
              endTime: '14:00',
              isActive: true,
            },
          ]),
        },
      };
      const prisma = {
        $transaction: jest.fn((work: (client: typeof tx) => unknown) =>
          work(tx),
        ),
      };
      const service = new ProvidersService(prisma as never, {} as never);

      await service.replaceWorkingPeriods(context, 'p1', 'l1', {
        periods: [
          {
            dayOfWeek: DayOfWeek.MONDAY,
            startTime: '10:00',
            endTime: '14:00',
          },
        ],
      });
      expect(tx.$executeRaw).toHaveBeenCalledTimes(1);
      expect(tx.$executeRaw.mock.invocationCallOrder[0]).toBeLessThan(
        tx.location.findFirst.mock.invocationCallOrder[0],
      );

      expect(tx.providerWorkingPeriod.deleteMany).toHaveBeenCalledWith({
        where: { tenantId: 'tenant-a', providerId: 'p1', locationId: 'l1' },
      });
      expect(tx.providerWorkingPeriod.createMany).toHaveBeenCalledWith({
        data: [
          expect.objectContaining({
            tenantId: 'tenant-a',
            providerId: 'p1',
            locationId: 'l1',
            isActive: true,
          }),
        ],
      });
    });

    it('uses an empty array to remove a schedule', async () => {
      const tx = {
        $executeRaw: jest.fn(),
        provider: { findFirst: jest.fn().mockResolvedValue({ id: 'p1' }) },
        location: {
          findFirst: jest.fn().mockResolvedValue({
            id: 'l1',
            status: 'ACTIVE',
            businessHours: [],
          }),
        },
        providerLocation: {
          findFirst: jest.fn().mockResolvedValue({ id: 'assignment' }),
        },
        providerWorkingPeriod: {
          deleteMany: jest.fn(),
          createMany: jest.fn(),
          findMany: jest.fn().mockResolvedValue([]),
        },
      };
      const prisma = {
        $transaction: jest.fn((work: (client: typeof tx) => unknown) =>
          work(tx),
        ),
      };
      const service = new ProvidersService(prisma as never, {} as never);

      await expect(
        service.replaceWorkingPeriods(context, 'p1', 'l1', { periods: [] }),
      ).resolves.toEqual([]);
      expect(tx.providerWorkingPeriod.createMany).not.toHaveBeenCalled();
    });

    it.each([
      [
        'location',
        { provider: { id: 'p1' }, location: null, assignment: null },
      ],
      [
        'assignment',
        { provider: { id: 'p1' }, location: { id: 'l1' }, assignment: null },
      ],
    ])('rejects a missing %s', async (_label, found) => {
      const tx = {
        $executeRaw: jest.fn(),
        provider: { findFirst: jest.fn().mockResolvedValue(found.provider) },
        location: { findFirst: jest.fn().mockResolvedValue(found.location) },
        providerLocation: {
          findFirst: jest.fn().mockResolvedValue(found.assignment),
        },
      };
      const service = new ProvidersService(
        {
          $transaction: jest.fn((work: (client: typeof tx) => unknown) =>
            work(tx),
          ),
        } as never,
        {} as never,
      );
      await expect(
        service.replaceWorkingPeriods(context, 'p1', 'l1', { periods: [] }),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('rejects equal and reversed ranges before changing stored periods', async () => {
      const transaction = jest.fn();
      const prisma = {
        provider: { findFirst: jest.fn().mockResolvedValue({ id: 'p1' }) },
        location: { findFirst: jest.fn().mockResolvedValue({ id: 'l1' }) },
        providerLocation: {
          findFirst: jest.fn().mockResolvedValue({ id: 'assignment' }),
        },
        $transaction: transaction,
      };
      const service = new ProvidersService(prisma as never, {} as never);
      await expect(
        service.replaceWorkingPeriods(context, 'p1', 'l1', {
          periods: [
            {
              dayOfWeek: DayOfWeek.MONDAY,
              startTime: '17:00',
              endTime: '09:00',
            },
          ],
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(transaction).not.toHaveBeenCalled();
    });

    it('converts duplicate constraint failures to a safe client error', async () => {
      const duplicate = new Prisma.PrismaClientKnownRequestError('duplicate', {
        code: 'P2002',
        clientVersion: 'test',
      });
      const service = new ProvidersService(
        {
          provider: { findFirst: jest.fn().mockResolvedValue({ id: 'p1' }) },
          location: { findFirst: jest.fn().mockResolvedValue({ id: 'l1' }) },
          providerLocation: {
            findFirst: jest.fn().mockResolvedValue({ id: 'assignment' }),
          },
          $transaction: jest.fn().mockRejectedValue(duplicate),
        } as never,
        {} as never,
      );
      await expect(
        service.replaceWorkingPeriods(context, 'p1', 'l1', {
          periods: [
            {
              dayOfWeek: DayOfWeek.MONDAY,
              startTime: '09:00',
              endTime: '10:00',
            },
          ],
        }),
      ).rejects.toThrow(
        new BadRequestException('Working periods are invalid.'),
      );
    });

    it('rejects overlap before deleting the previous schedule', async () => {
      const tx = {
        $executeRaw: jest.fn(),
        provider: { findFirst: jest.fn().mockResolvedValue({ id: 'p1' }) },
        location: {
          findFirst: jest.fn().mockResolvedValue({
            id: 'l1',
            status: 'ACTIVE',
            businessHours: [
              {
                dayOfWeek: DayOfWeek.MONDAY,
                isClosed: false,
                openTime: '09:00',
                closeTime: '17:00',
              },
            ],
          }),
        },
        providerLocation: {
          findFirst: jest.fn().mockResolvedValue({ id: 'assignment' }),
        },
        providerWorkingPeriod: {
          deleteMany: jest.fn(),
          createMany: jest.fn(),
          findMany: jest.fn(),
        },
      };
      const service = new ProvidersService(
        {
          $transaction: jest.fn((work: (client: typeof tx) => unknown) =>
            work(tx),
          ),
        } as never,
        {} as never,
      );

      const promise = service.replaceWorkingPeriods(context, 'p1', 'l1', {
        periods: [
          {
            dayOfWeek: DayOfWeek.MONDAY,
            startTime: '09:00',
            endTime: '13:00',
          },
          {
            dayOfWeek: DayOfWeek.MONDAY,
            startTime: '12:00',
            endTime: '14:00',
          },
        ],
      });

      await expect(promise).rejects.toMatchObject({
        response: { code: scheduleConflictCodes.overlap },
      });
      expect(tx.providerWorkingPeriod.deleteMany).not.toHaveBeenCalled();
    });

    it.each(['UTC', 'America/New_York'])(
      'does not load another location as an overlap dependency when its timezone is %s',
      async (otherTimezone) => {
        const tx = {
          $executeRaw: jest.fn(),
          provider: { findFirst: jest.fn().mockResolvedValue({ id: 'p1' }) },
          location: {
            findFirst: jest.fn().mockResolvedValue({
              id: 'selected-location',
              timezone: otherTimezone,
              status: 'ACTIVE',
              businessHours: [
                {
                  dayOfWeek: DayOfWeek.MONDAY,
                  isClosed: false,
                  openTime: '08:00',
                  closeTime: '18:00',
                },
              ],
            }),
          },
          providerLocation: {
            findFirst: jest.fn().mockResolvedValue({ id: 'assignment' }),
          },
          providerWorkingPeriod: {
            deleteMany: jest.fn(),
            createMany: jest.fn(),
            findMany: jest.fn().mockResolvedValue([]),
          },
        };
        const service = new ProvidersService(
          {
            $transaction: jest.fn((work: (client: typeof tx) => unknown) =>
              work(tx),
            ),
          } as never,
          {} as never,
        );

        await expect(
          service.replaceWorkingPeriods(context, 'p1', 'selected-location', {
            periods: [
              {
                dayOfWeek: DayOfWeek.MONDAY,
                startTime: '11:00',
                endTime: '15:00',
              },
            ],
          }),
        ).resolves.toEqual([]);
        expect(tx.providerWorkingPeriod.findMany).toHaveBeenCalledWith(
          expect.objectContaining({
            where: {
              tenantId: 'tenant-a',
              providerId: 'p1',
              locationId: 'selected-location',
            },
          }),
        );
      },
    );
  });

  it('diffs location assignments so retained schedules survive and removed ones cascade', async () => {
    const tx = {
      providerLocation: {
        findMany: jest
          .fn()
          .mockResolvedValue([
            { locationId: 'retained' },
            { locationId: 'removed' },
          ]),
        deleteMany: jest.fn(),
        createMany: jest.fn(),
      },
    };
    const prisma = {
      provider: {
        findFirst: jest.fn().mockResolvedValue({
          providerLocations: [],
          providerServices: [],
        }),
      },
      location: {
        count: jest.fn().mockResolvedValue(2),
        findMany: jest.fn().mockResolvedValue([]),
      },
      $transaction: jest.fn((work: (client: typeof tx) => unknown) => work(tx)),
    };
    const service = new ProvidersService(prisma as never, {} as never);

    await service.replaceLocations({ tenantId: 'tenant-a' } as never, 'p1', {
      ids: ['retained', 'added'],
    });

    expect(tx.providerLocation.deleteMany).toHaveBeenCalledWith({
      where: {
        tenantId: 'tenant-a',
        providerId: 'p1',
        locationId: { in: ['removed'] },
      },
    });
    expect(tx.providerLocation.createMany).toHaveBeenCalledWith({
      data: [{ tenantId: 'tenant-a', providerId: 'p1', locationId: 'added' }],
    });
  });
});
