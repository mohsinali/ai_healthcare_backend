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

    return environment;
  }, 'production CORS validation')
  .messages({ 'any.custom': '{{#message}}' });
