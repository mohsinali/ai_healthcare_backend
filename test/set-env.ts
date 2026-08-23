process.env.NODE_ENV = 'test';
process.env.PORT = '3000';
process.env.DATABASE_URL =
  'postgresql://user:password@localhost:5432/ai_healthcare_test';
process.env.CORS_ORIGIN = 'http://localhost:3001';
process.env.JWT_ACCESS_SECRET = 'access-secret-at-least-thirty-two-characters';
process.env.JWT_REFRESH_SECRET =
  'refresh-secret-at-least-thirty-two-characters';
process.env.FRONTEND_URL = 'http://localhost:3001';
