# Tenant provisioning

`POST /api/v1/tenants` is a Super Admin operation that creates the tenant and
its database-only baseline in one Prisma transaction. The baseline currently
consists of the existing `Tenant` defaults and one initial `WebVoiceChannel`.
No external provider is contacted while provisioning.

The initial channel has a cryptographically random `wgt_` public routing key,
no location, an empty origin allowlist, and `INACTIVE` status. It therefore
fails closed. The key is globally unique in PostgreSQL and is never regenerated
by repair. The nullable, tenant-unique `provisioningKey` identifies the initial
channel without limiting manually created channels.

CareFlow serves one shared `/voice-widget/embed.js`. Provisioning does not copy
or generate JavaScript, signed ElevenLabs URLs, Redis sessions, agent secrets,
or tenant credentials. Installation snippets are computed by the frontend from
the shared loader URL and public widget key.

## Defaults and manual setup

The schema's existing tenant defaults remain `UTC` and `MM_DD_YYYY`. Country,
phone region, and locale are not tenant-level concepts in the current domain;
real locations collect ISO country and IANA timezone data. Appointment and
entity reference sequences remain lazy-created on first use. Roles are fixed
enums and memberships are assigned explicitly.

Super Admin must create a real location, configure its hours, add applicable
services/providers and scheduling associations, configure knowledge content,
associate the channel with a location, add exact production origins, review the
shared-loader snippet, and then enable and test the channel. Telephony remains
separate. Activation is rejected until the channel has both a location and an
allowed origin.

## Readiness, retry, and repair

Tenant detail responses derive required and recommended checks from current
records. They distinguish clinic setup incomplete, voice configuration
incomplete, ready to activate, and active. No duplicated readiness boolean is
stored.

Provisioning is idempotent: it preserves any existing channel's status, public
key, origins, agent, and location, and creates a channel only when none exists.
`POST /api/v1/tenants/:tenantId/provisioning` is the deliberate Super Admin-only
repair operation for one tenant. Inspect `GET /api/v1/tenants/:tenantId` first
for a dry-run equivalent: a null `provisioning` value means the channel is
missing. There is intentionally no application-startup or mass backfill.

Tenant and required channel creation roll back together. Widget-key collisions
retry the whole transaction up to three times. A tenant-scoped unique database
constraint serializes concurrent attempts to create the initial channel.
Operational errors follow the existing API exception conventions; public keys,
credentials, tokens, and signed URLs must not be logged.

All tenant provisioning/status and channel management routes are protected by
backend `SUPER_ADMIN` RBAC. Public widget bootstrap retains exact-origin,
widget-key, and session security and does not require Super Admin authentication.
