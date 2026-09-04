# Scheduling / Appointments — Stage 1

Appointments are a tenant-owned Core SaaS domain. React and future adapters request availability and mutations; the backend `AppointmentsService` is authoritative for eligibility, business hours, duration, conflicts, and state transitions.

## Domain model

`Appointment` uses a UUID primary key plus a concurrency-safe tenant sequence displayed as `APT-000001`. It references a same-tenant Patient, Location, Provider, and Service. Actual `startAt` and `endAt` values are PostgreSQL `timestamptz` values and are persisted as UTC instants. Reason and notes are administrative scheduling data, not clinical notes. Appointments are never hard-deleted.

Statuses are `BOOKED`, `CONFIRMED`, `CANCELLED`, `COMPLETED`, and `NO_SHOW`. Stage 1 UI actions implement `BOOKED → CONFIRMED` and `BOOKED/CONFIRMED → CANCELLED`. Cancelled, completed, and no-show records are terminal. Confirmation and cancellation are safely repeatable.

`AppointmentEvent` records `CREATED`, `RESCHEDULED`, `CONFIRMED`, `CANCELLED`, `COMPLETED`, or `NO_SHOW`. Metadata is deliberately minimal (for example old/new scheduling instants on reschedule). These rows are domain history and are not a generic audit log or outbox.

## Availability and timezones

Stage 1 assumes an active Provider is potentially available throughout an active Location's recurring Business Hours when all three Provider–Location, Provider–Service, and Location–Service assignments exist. There are no hidden Provider calendars, PTO, holidays, split hours, buffers, or external calendar rules.

`Location.timezone` is the sole scheduling timezone authority. Business Hours and requested dates are interpreted as local wall time in that IANA zone with Luxon. Tenant and browser timezones never override it. Offset-aware create/reschedule input must agree with the Location zone. Nonexistent and ambiguous unqualified local times are rejected; ambiguous fallback slots are omitted from generated availability. Operational responses include location-local ISO values while persisted instants remain UTC.

Slots start every 15 minutes. The backend adds `Service.durationMinutes`, requires the complete interval to fit inside the day's single Business Hour interval, and removes any slot overlapping a non-cancelled Provider appointment using `requestedStart < existingEnd AND requestedEnd > existingStart`.

## Concurrency

Create and reschedule run in database transactions. They acquire a PostgreSQL transaction-scoped advisory lock derived from tenant, Provider, and Location-local date, then revalidate configuration, hours, and overlaps inside the transaction before writing the Appointment and AppointmentEvent. Calls competing for the same Provider/day serialize, so stale availability cannot create overlapping appointments. Conflicts return HTTP 409 with a safe business message. The tenant appointment sequence is also atomically incremented inside the create transaction.

## APIs and authorization

All routes require a trusted `TenantContext` and allow `CLINIC_OWNER`, `CLINIC_ADMIN`, and `RECEPTIONIST`:

- `GET /api/v1/scheduling/availability`
- `GET /api/v1/scheduling/providers`
- `POST /api/v1/appointments`
- `GET /api/v1/appointments` with practical filters
- `GET /api/v1/appointments/:id`
- `PATCH /api/v1/appointments/:id` for reason/administrative notes only
- `POST /api/v1/appointments/:id/reschedule`
- `POST /api/v1/appointments/:id/cancel`
- `POST /api/v1/appointments/:id/confirm`

Every lookup and relationship check is tenant-scoped. Submitted tenant IDs, end times, durations, and statuses are rejected by DTO whitelisting. Historical appointments remain readable after related configuration is deactivated, while new booking/rescheduling requires active configuration and an active Patient.

## Frontend

Routes are `/appointments`, `/appointments/new`, `/appointments/[appointmentId]`, and `/appointments/[appointmentId]/reschedule`. Booking cascades Location → offered Service → eligible Provider → Date → server-generated time. Create and reschedule each have exactly one primary submit action. A 409 preserves upstream fields, clears the stale time, and refreshes availability. Appointment detail supports confirm, reschedule, and cancel. Patient detail loads its appointment section through the filtered Appointment list API.

Query keys always include tenant ID. Mutations invalidate only appointment lists/details, patient appointment history, and relevant availability families.

## Deferred work

Provider-specific hours/calendars, PTO, holidays, split hours, reminders, notifications, transactional outbox consumers, idempotency keys for external tools, Voice/Twilio/ElevenLabs/n8n, calendar/EHR adapters, recurring/group/resource scheduling, waitlists, billing, insurance, and clinical notes remain future milestones. Appointment events are the clean domain boundary from which a transactional outbox can later be produced.
