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
