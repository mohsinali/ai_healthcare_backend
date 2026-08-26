import { Test } from '@nestjs/testing';
import { PrismaService } from '../database/prisma.service';
import { TelephonyModule } from './telephony.module';
import { TelephonyService } from './telephony.service';

describe('TelephonyModule', () => {
  it('provides TelephonyService with its database dependency', async () => {
    const module = await Test.createTestingModule({
      imports: [TelephonyModule],
    })
      .overrideProvider(PrismaService)
      .useValue({})
      .compile();

    expect(module.get(TelephonyService)).toBeInstanceOf(TelephonyService);
  });
});
