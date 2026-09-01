import { ServiceUnavailableException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from '../database/prisma.service';
import { HealthController } from './health.controller';
import { RedisService } from '../redis/redis.service';

describe('HealthController', () => {
  let controller: HealthController;
  let queryRaw: jest.Mock;

  beforeEach(async () => {
    queryRaw = jest.fn().mockResolvedValue([{ '?column?': 1 }]);
    const module: TestingModule = await Test.createTestingModule({
      controllers: [HealthController],
      providers: [
        {
          provide: PrismaService,
          useValue: { $queryRaw: queryRaw },
        },
        { provide: RedisService, useValue: { ping: jest.fn() } },
      ],
    }).compile();

    controller = module.get(HealthController);
  });

  it('returns ok when the database is reachable', async () => {
    await expect(controller.check()).resolves.toEqual({ status: 'ok' });
    expect(queryRaw).toHaveBeenCalledTimes(1);
  });

  it('returns an unavailable error when the database cannot be reached', async () => {
    queryRaw.mockRejectedValueOnce(new Error('connection failed'));
    await expect(controller.check()).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
  });
});
