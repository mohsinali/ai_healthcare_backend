import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import appConfig from './config/app.config';
import databaseConfig from './config/database.config';
import { environmentValidationSchema } from './config/env.validation';
import { DatabaseModule } from './database/database.module';
import { HealthModule } from './health/health.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      cache: true,
      expandVariables: false,
      load: [appConfig, databaseConfig],
      validationSchema: environmentValidationSchema,
      validationOptions: { abortEarly: false },
    }),
    DatabaseModule,
    HealthModule,
  ],
})
export class AppModule {}
