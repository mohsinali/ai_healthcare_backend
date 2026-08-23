import { environmentValidationSchema } from './env.validation';

describe('environment validation', () => {
  const validEnvironment = {
    NODE_ENV: 'test',
    PORT: 3000,
    DATABASE_URL: 'postgresql://user:password@localhost:5432/app',
    CORS_ORIGIN: 'http://localhost:3001',
  };

  it('accepts a valid environment', () => {
    const result = environmentValidationSchema.validate(validEnvironment);
    expect(result.error).toBeUndefined();
  });

  it('rejects a missing database URL', () => {
    const environment: Record<string, unknown> = { ...validEnvironment };
    delete environment.DATABASE_URL;
    const result = environmentValidationSchema.validate(environment);
    expect(result.error?.message).toContain('DATABASE_URL');
  });

  it('rejects an invalid port', () => {
    const result = environmentValidationSchema.validate({
      ...validEnvironment,
      PORT: 70000,
    });
    expect(result.error?.message).toContain('PORT');
  });

  it('rejects wildcard CORS in production', () => {
    const result = environmentValidationSchema.validate({
      ...validEnvironment,
      NODE_ENV: 'production',
      CORS_ORIGIN: '*',
    });
    expect(result.error?.message).toContain('CORS_ORIGIN');
  });
});
