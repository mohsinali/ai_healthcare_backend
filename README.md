# AI Healthcare Backend

Production-oriented NestJS foundation for the AI Healthcare Front Desk Voice Agent. It is an independently deployable modular monolith backed by PostgreSQL and Prisma. No healthcare domain functionality is included yet.

## Prerequisites

- Node.js 20.19.6 (use `nvm use`)
- npm 10
- Docker with Docker Compose

## Environment

Create a local environment file and replace the example password with a local-only value:

```bash
cp .env.example .env
```

`DATABASE_URL` is used by Prisma and local NestJS. The `POSTGRES_*` variables configure the Compose database. When the API runs in Compose, its database hostname is automatically changed to `postgres`.

## Docker-based setup

Run the complete stack:

```bash
docker compose up --build
```

Then open:

- Health: http://localhost:3000/api/v1/health
- Swagger (when `NODE_ENV` is not `production`): http://localhost:3000/docs

The API waits for PostgreSQL's health check before starting. Database migrations are deliberately not run by the application container.

## Local API with PostgreSQL in Docker

```bash
nvm use
npm ci
docker compose up -d postgres
npm run prisma:generate
npm run start:dev
```

Once real schema models and migrations exist, create development migrations with:

```bash
npm run prisma:migrate
```

Deployment environments should apply committed migrations separately before starting the application:

```bash
npm run prisma:migrate:deploy
```

## Useful commands

```bash
npm run build
npm run lint
npm test
npm run test:e2e
npm run test:cov
npm run format
npm run prisma:generate
npm run prisma:studio
```

## Operational notes

- All HTTP routes use URI versioning under `/api/v1`.
- The health endpoint verifies database connectivity without exposing infrastructure details.
- Swagger is disabled automatically in production.
- CORS accepts a comma-separated allowlist from `CORS_ORIGIN`; do not use `*` in production.
- Logging intentionally avoids request bodies, headers, query strings, and exception details in preparation for future PHI-safe practices.
- Graceful shutdown hooks close Prisma connections on process termination.
# Authentication foundation

Authentication is application-managed. Access tokens live only in frontend memory; rotating refresh tokens are stored in an HttpOnly cookie and only a SHA-256 digest of each high-entropy signed token is persisted. Cookie-backed refresh/logout use POST, credentialed allow-listed CORS, and `SameSite=lax` by default (`Secure=true` is mandatory in production). If a future deployment requires cross-site cookies (`SameSite=none`), add an explicit CSRF token check before enabling it.

Stage 1 rate limiting is process-local. Use a shared limiter before horizontally scaling the API. Production password-reset delivery must replace the development-only mail adapter. MFA (TOTP/WebAuthn or an external IdP) is an important future enhancement. Tenant roles (`CLINIC_OWNER`, `CLINIC_ADMIN`, `RECEPTIONIST`) belong on future memberships, never on `User`.

Future audit events include `USER_LOGIN_SUCCESS`, `USER_LOGIN_FAILED`, `USER_LOGOUT`, `PASSWORD_CHANGED`, `PASSWORD_RESET`, `SESSION_REVOKED`, `ACCESS_DENIED`, `USER_SUSPENDED`, and `PLATFORM_ROLE_CHANGED`.

## Local authentication test

1. Copy `.env.example` to `.env`, replace both JWT placeholders with different random values of at least 32 characters, and set backend `PORT=3001`, `CORS_ORIGIN=http://localhost:3000`, and `FRONTEND_URL=http://localhost:3000`.
2. Start PostgreSQL: `docker compose up -d postgres`.
3. Run `npm run prisma:generate` and `npm run prisma:migrate`.
4. Create the operator account: `npm run users:create-super-admin`. For non-interactive automation, provide `ADMIN_EMAIL`, `ADMIN_FIRST_NAME`, `ADMIN_LAST_NAME`, and `ADMIN_PASSWORD` only in the command environment; never commit them.
5. Start the API with `npm run start:dev`.
6. In `../ai_healthcare_frontend`, copy `.env.example` to `.env.local`, set `NEXT_PUBLIC_API_BASE_URL=http://localhost:3001/api/v1`, then run `npm run dev`.
7. Open `http://localhost:3000/login`. Verify login, `/auth/me`, browser-refresh session recovery, sign-out and protected-route redirect. Then exercise wrong credentials, change a user to `SUSPENDED`/`DISABLED`, password change, and the development reset URL printed by the local mail adapter.

Password changes revoke all sessions, including the current refresh session, and require a fresh login. No tenant, clinic, membership, registration, or MFA model is created by this foundation.
