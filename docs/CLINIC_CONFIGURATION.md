# Clinic Configuration

Clinic configuration is a tenant-owned foundation for future patient, scheduling, FAQ, and voice-agent phases. It contains no patient data and calculates no appointment availability.

## Domain model

- `Location` stores contact/address details, an IANA timezone, ordinary phone, escalation phone, and `ACTIVE`/`INACTIVE` status.
- `BusinessHour` stores one recurring local wall-clock interval per weekday. A location is created transactionally with Monday–Friday 09:00–17:00 and weekends closed. Times remain `HH:mm`; `Location.timezone` supplies timezone context.
- `Provider` is a schedulable professional/resource, separate from application `User`, with lean identity/contact fields and status.
- `Service` is an appointment type with `durationMinutes` (1–1440), which Scheduling will consume later.
- `ProviderLocation`, `ProviderService`, and `LocationService` are configuration-only many-to-many joins. They do not calculate availability.

Every model carries `tenantId`. Requests select a tenant with `X-Tenant-Id`, but the authenticated user's active membership is authoritative. Services scope object reads by `id + tenantId`, validate every assignment ID in the same tenant, and bulk-replace joins transactionally. Composite `(tenantId, id)` foreign keys add database-level cross-tenant protection.

## Access and lifecycle

`CLINIC_OWNER` and `CLINIC_ADMIN` can read and mutate configuration. `RECEPTIONIST` is read-only. Records are deactivated, not hard-deleted, and relationships are preserved. Phone numbers are validated with `libphonenumber-js` and stored as E.164; emails are trimmed/lowercased. Exact normalized Location and Service names are unique within a tenant.

## APIs

- `/api/v1/locations` — paginated list, create, detail, update
- `/api/v1/locations/:id/business-hours` — read and transactional weekly replacement
- `/api/v1/locations/:id/services` — read and transactional replacement
- `/api/v1/providers` — paginated list, create, detail, update
- `/api/v1/providers/:id/locations` and `/services` — read and transactional replacement
- `/api/v1/services` — paginated list, create, detail, update

All list APIs accept `page`, `limit`, `search`, and `status`. Swagger documents the validated tenant-selection header.

## Frontend

Routes are `/locations`, `/providers`, `/services`, their `/new` forms, and `/:id` detail/edit screens. Query keys always include the tenant ID, for example `['locations', tenantId, filters]` and `['location', tenantId, id]`, and are marked tenant-scoped for removal during tenant switching. Mutation controls are hidden for Receptionists. Location editing includes a runtime-sourced IANA timezone selector and responsive weekly hours editor.

## Local verification

1. In `ai_healthcare_backend`, run `docker compose up -d`, `npm install`, `npx prisma generate`, `npx prisma migrate deploy`, then `npm run start:dev`.
2. In `ai_healthcare_frontend`, run `npm install` and `npm run dev`.
3. Create/select Tenant A and sign in with Clinic Owner membership.
4. Add a location with an international phone, timezone, escalation number, and edit all seven business-hour rows.
5. Add two providers and two services (60- and 30-minute durations); configure provider/location/service assignments through the relationship APIs.
6. Confirm detail screens and inactive/reactivation status changes in light, dark, desktop, and mobile layouts.
7. Sign in as Receptionist: reads succeed, controls are absent, and direct mutation requests return 403.
8. Select Tenant B and request Tenant A object/assignment IDs: requests must return 404/403 without leaking data.

## Deferred

Split-day hours, closures/holidays, provider calendars/hours, scheduling rules, appointment availability/bookings, patients/PHI, FAQs/knowledge base, phone provisioning, routing policies, Twilio, ElevenLabs, and voice transfers remain separate milestones.
