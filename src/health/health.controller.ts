import { Controller, Get, ServiceUnavailableException } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { PrismaService } from '../database/prisma.service';
import { Public } from '../auth/decorators/public.decorator';
import { RedisService } from '../redis/redis.service';

export interface HealthResponse {
  status: 'ok';
}

@ApiTags('health')
@Controller('health')
@Public()
export class HealthController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
  ) {}

  @Get()
  @ApiOperation({ summary: 'Check API and database availability' })
  @ApiOkResponse({ schema: { example: { status: 'ok' } } })
  async check(): Promise<HealthResponse> {
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      await this.redis.ping();
      return { status: 'ok' };
    } catch {
      throw new ServiceUnavailableException('Service unavailable');
    }
  }
}
