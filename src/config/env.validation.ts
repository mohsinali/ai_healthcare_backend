import * as Joi from 'joi';

export const environmentValidationSchema = Joi.object({
  NODE_ENV: Joi.string()
    .valid('development', 'test', 'production')
    .default('development'),
  PORT: Joi.number().port().default(3000),
  DATABASE_URL: Joi.string()
    .uri({ scheme: ['postgresql', 'postgres'] })
    .required(),
  POSTGRES_DB: Joi.string().min(1).optional(),
  POSTGRES_USER: Joi.string().min(1).optional(),
  POSTGRES_PASSWORD: Joi.string().min(1).optional(),
  POSTGRES_PORT: Joi.number().port().default(5432),
  CORS_ORIGIN: Joi.string().min(1).required(),
  JWT_ACCESS_SECRET: Joi.string().min(32).required(),
  JWT_REFRESH_SECRET: Joi.string().min(32).required(),
  VOICE_GATEWAY_API_KEY: Joi.string().min(32).required(),
  ELEVENLABS_API_KEY: Joi.string().empty('').min(1).optional(),
  ELEVENLABS_AGENT_ID: Joi.string().empty('').min(1).optional(),
  JWT_ACCESS_TTL: Joi.string().default('15m'),
  JWT_REFRESH_TTL: Joi.string().default('14d'),
  AUTH_REFRESH_COOKIE_NAME: Joi.string().default('aiva_refresh'),
  AUTH_COOKIE_SECURE: Joi.boolean().default(false),
  AUTH_COOKIE_SAME_SITE: Joi.string()
    .valid('strict', 'lax', 'none')
    .default('lax'),
  PASSWORD_RESET_TTL_MINUTES: Joi.number()
    .integer()
    .min(5)
    .max(1440)
    .default(45),
  FRONTEND_URL: Joi.string().uri().required(),
})
  .unknown(true)
  .custom((environment: Record<string, unknown>, helpers) => {
    if (
      environment.NODE_ENV === 'production' &&
      String(environment.CORS_ORIGIN)
        .split(',')
        .some((origin) => origin.trim() === '*')
    ) {
      return helpers.error('any.custom', {
        message: 'CORS_ORIGIN cannot contain * in production',
      });
    }
    if (
      environment.NODE_ENV === 'production' &&
      environment.AUTH_COOKIE_SECURE !== true
    ) {
      return helpers.error('any.custom', {
        message: 'AUTH_COOKIE_SECURE must be true in production',
      });
    }
    if (environment.AUTH_COOKIE_SAME_SITE === 'none') {
      return helpers.error('any.custom', {
        message:
          'AUTH_COOKIE_SAME_SITE=none requires CSRF protection that is not enabled',
      });
    }
    if (
      environment.VOICE_GATEWAY_API_KEY === environment.JWT_ACCESS_SECRET ||
      environment.VOICE_GATEWAY_API_KEY === environment.JWT_REFRESH_SECRET
    ) {
      return helpers.error('any.custom', {
        message:
          'VOICE_GATEWAY_API_KEY must be different from JWT_ACCESS_SECRET and JWT_REFRESH_SECRET',
      });
    }

    return environment;
  }, 'production CORS validation')
  .messages({ 'any.custom': '{{#message}}' });
