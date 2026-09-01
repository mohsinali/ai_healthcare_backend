import {
  Injectable,
  Logger,
  OnApplicationShutdown,
  OnModuleInit,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createClient, RedisClientType } from 'redis';

@Injectable()
export class RedisService implements OnModuleInit, OnApplicationShutdown {
  private readonly logger = new Logger(RedisService.name);
  private readonly client: RedisClientType;

  constructor(config: ConfigService) {
    const password = config.get<string>('REDIS_PASSWORD')?.trim() || undefined;
    this.client = createClient({
      socket: {
        host: config.getOrThrow<string>('REDIS_HOST'),
        port: config.getOrThrow<number>('REDIS_PORT'),
        reconnectStrategy: (retries) =>
          retries >= 5
            ? new Error('Redis reconnect limit reached')
            : Math.min(retries * 100, 3_000),
      },
      password,
      database: config.getOrThrow<number>('REDIS_DB'),
    });
    this.client.on('error', () => {
      this.logger.error('Redis connection error');
    });
  }

  async onModuleInit(): Promise<void> {
    try {
      await this.client.connect();
      await this.client.ping();
      this.logger.log('Redis connection ready');
    } catch {
      this.logger.error('Redis startup connection failed');
      throw new ServiceUnavailableException(
        'Transient session service is unavailable.',
      );
    }
  }

  async onApplicationShutdown(): Promise<void> {
    if (this.client.isOpen) await this.client.quit().catch(() => undefined);
  }

  async execute<T>(
    operation: (client: RedisClientType) => Promise<T>,
  ): Promise<T> {
    if (!this.client.isReady) this.unavailable();
    try {
      return await operation(this.client);
    } catch {
      this.unavailable();
    }
  }

  async ping(): Promise<void> {
    await this.execute(async (client) => {
      await client.ping();
    });
  }

  private unavailable(): never {
    throw new ServiceUnavailableException(
      'Transient session service is unavailable.',
    );
  }
}
