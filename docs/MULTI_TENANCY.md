# Multi-Tenancy Architecture

The product uses one PostgreSQL database and one shared schema. `User` is global; clinic access exists only through the unique `(tenantId, userId)` `TenantMembership` relation. `PlatformRole.SUPER_ADMIN` remains separate from `TenantRole` (`CLINIC_OWNER`, `CLINIC_ADMIN`, `RECEPTIONIST`) and does not imply clinic membership or unrestricted access to future PHI.

> A tenant ID supplied by the frontend selects the requested tenant. It does not authorize access to that tenant.

## Request Isolation

Platform management endpoints under `/api/v1/tenants` require `SUPER_ADMIN`. Future tenant business endpoints opt into `TenantContextRequired` and receive `X-Tenant-Id` as a requested UUID. Guards run in this order: authentication, platform authorization, tenant-context resolution, then tenant-role authorization. Context resolution queries the authoritative database and requires an active global user, active tenant, and active membership. Failures return a generic denial without revealing an unrelated tenant. Trusted controller code consumes `CurrentTenant`, never the raw header, body, frontend role, local storage, or JWT tenant claims.

The trusted context contains `tenantId`, `tenantSlug`, `tenantRole`, and `membershipId`. Membership changes therefore take effect on the next request without waiting for access-token expiry. `SUPER_ADMIN` uses platform APIs and is not silently granted tenant data access.

## Data-Access Convention

Every future tenant-owned domain table must have `tenantId` unless an architectural exception is deliberately documented. Tenant-scoped service methods accept a trusted context (for example, `patientsService.list(currentTenant, filters)`) and centrally add tenant constraints. Controllers must not pass arbitrary body/query tenant IDs. Explicit platform services are the only place for cross-tenant queries.

PostgreSQL Row Level Security is not enabled yet. Application-layer isolation is Stage 1 enforcement; RLS may be added later as defense in depth after the model stabilizes. This implementation is a security boundary, but is not by itself a claim of HIPAA compliance.

## Authentication and Frontend Selection

`GET /api/v1/auth/me` returns safe memberships and tenant identity/status data, never passwords or sessions. The frontend derives active choices centrally. One clinic is auto-selected, multiple clinics show a selector, zero clinics show “No Clinic Access,” and a stale saved ID is discarded. Only the tenant ID is persisted in local storage as convenience state.

Use `tenantApiRequest(path, currentTenant.id)` only for tenant-scoped APIs. Platform calls use `apiRequest`. TanStack Query platform keys begin `['platform', ...]`; future tenant keys must contain the tenant ID, such as `['patients', tenantId, filters]`, and set `meta: { tenantScoped: true }`. Switching tenants cancels and removes those tenant-scoped queries to prevent stale cross-clinic rendering.

## Operator Setup and Manual Security Check

From `ai_healthcare_backend`:

```bash
npm run users:create-super-admin
npm run users:create
npm run users:create
```

Then sign in as the super admin, create Tenant A and Tenant B, and assign User A as Tenant A Clinic Owner and Tenant B Clinic Admin. Assign User B as Tenant A Receptionist. Sign in as User A and verify both clinics and role changes. Send a tenant-scoped test request with User A's bearer token but an unrelated UUID in `X-Tenant-Id`; it must return `403` without tenant details. Suspend a membership and then a tenant and confirm normal access disappears while the super admin can still manage the tenant.

Invitations, onboarding email, clinic configuration, healthcare domain models, billing, analytics, RLS, SSO, and MFA are intentionally deferred.
