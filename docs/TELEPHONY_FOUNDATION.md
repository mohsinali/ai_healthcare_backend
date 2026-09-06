# Telephony Backend Foundation

`TelephonyNumber` maps a dialed inbound phone number to exactly one tenant and, optionally, one clinic location. The dialed number is the trusted routing key. The LLM must never decide tenant identity, and callers must never supply `tenantId` or `locationId` as routing authority.

## Data and lifecycle

- `phoneNumber` is parsed with the same `libphonenumber-js` utility used by clinic configuration and persisted in E.164 format.
- `phoneNumber` has a global database unique constraint. Formatting variants therefore resolve to the same routing key, and concurrent claims are stopped by PostgreSQL. Admin conflicts return `409 This phone number is already configured.` without tenant details.
- Every record belongs to the tenant from the trusted `TenantContext`; `tenantId` is not part of create/update DTOs.
- `locationId` may be null. Null means tenant-wide routing; a later voice conversation may determine a location. A non-null location must belong to the same tenant, enforced by service validation and a composite foreign key.
- `provider` is the controlled `TelephonyProvider` enum. Stage 1 supports only `TWILIO`.
- `providerPhoneNumberId` is optional stored metadata for future provider integration. It is not remotely validated.
- New records default to `ACTIVE`. Normal lifecycle uses the status endpoint to switch between `ACTIVE` and `INACTIVE`; there is no delete endpoint.

## Tenant-admin API

All routes require bearer authentication, a validated `X-Tenant-Id` tenant context, and an active membership.

- `GET /api/v1/telephony-numbers?page=1&limit=20&search=&status=&locationId=`
- `POST /api/v1/telephony-numbers`
- `GET /api/v1/telephony-numbers/:id`
- `PATCH /api/v1/telephony-numbers/:id`
- `PATCH /api/v1/telephony-numbers/:id/status`

Clinic owners and clinic admins can read and write. Receptionists can only read. Cross-tenant detail and mutation targets are hidden as not found. Swagger documents DTO enums, E.164 input, optional location scope, pagination, and tenant-context semantics.

## Internal inbound resolution

`InboundNumberResolverService.resolve(calledNumber)` is an internal exported Nest service, not an HTTP endpoint. It normalizes the called number, performs a global lookup, and returns a small `ResolvedInboundNumberContext` containing mapping/provider fields, trusted tenant identity, and optional location name, timezone, and escalation number.

Resolution fails with a typed `InboundNumberResolutionError` for invalid/unknown numbers, inactive mappings, inactive/suspended/disabled tenants, and inactive locations. A tenant-wide active mapping does not require a location. Failures have a safe common message while retaining an internal reason code.

No Twilio or ElevenLabs SDK/API call, public voice/bootstrap endpoint, call/session model, voice tool, or frontend UI is included in this foundation.

## Manual verification

1. Log in as a `CLINIC_OWNER` in Tenant A and retain the access token and Tenant A ID.
2. POST a tenant-wide mapping with `{"phoneNumber":"+1 305 555 1000","provider":"TWILIO","locationId":null}` and verify the response stores `+13055551000` and `ACTIVE`.
3. POST `+1 305 555 1001` with a Tenant A location ID, then verify list and detail responses.
4. POST `+13055551001` again and verify a safe 409 conflict.
5. Switch to Tenant B and repeat that number; verify the same 409 contains no Tenant A information.
6. While scoped to Tenant A, submit a Tenant B location ID and verify it is rejected as not found.
7. Resolve `+1 305 555 1001` in the resolver test/REPL and verify Tenant A, its location, timezone, and escalation number.
8. Resolve the tenant-wide mapping and verify `locationId`, `locationName`, `timezone`, and `escalationPhoneNumber` are null.
9. Set the location-specific mapping to `INACTIVE` and verify resolution fails; reactivate it, deactivate its location, and verify resolution still fails.
10. As `RECEPTIONIST`, verify GET succeeds and POST/PATCH/status return 403.
