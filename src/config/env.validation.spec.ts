import { environmentValidationSchema } from './env.validation';

describe('environment validation', () => {
  const validEnvironment = {
    NODE_ENV: 'test',
    PORT: 3000,
    DATABASE_URL: 'postgresql://user:password@localhost:5432/app',
    CORS_ORIGIN: 'http://localhost:3001',
    JWT_ACCESS_SECRET: 'access-secret-at-least-thirty-two-characters',
    JWT_REFRESH_SECRET: 'refresh-secret-at-least-thirty-two-characters',
    VOICE_GATEWAY_API_KEY: 'voice-gateway-test-key-at-least-32-characters',
    FRONTEND_URL: 'http://localhost:3001',
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

  it('rejects a missing or weak Voice Gateway credential', () => {
    const missing: Record<string, unknown> = { ...validEnvironment };
    delete missing.VOICE_GATEWAY_API_KEY;
    expect(
      environmentValidationSchema.validate(missing).error?.message,
    ).toContain('VOICE_GATEWAY_API_KEY');
    expect(
      environmentValidationSchema.validate({
        ...validEnvironment,
        VOICE_GATEWAY_API_KEY: 'weak',
      }).error?.message,
    ).toContain('VOICE_GATEWAY_API_KEY');
  });

  it('rejects reuse of a user JWT secret for the Voice Gateway', () => {
    const result = environmentValidationSchema.validate({
      ...validEnvironment,
      VOICE_GATEWAY_API_KEY: validEnvironment.JWT_ACCESS_SECRET,
    });
    expect(result.error?.message).toContain(
      'VOICE_GATEWAY_API_KEY must be different',
    );
  });

  it('rejects wildcard CORS in production', () => {
    const result = environmentValidationSchema.validate({
      ...validEnvironment,
      NODE_ENV: 'production',
      CORS_ORIGIN: '*',
      AUTH_COOKIE_SECURE: true,
    });
    expect(result.error?.message).toContain('CORS_ORIGIN');
  });
});
