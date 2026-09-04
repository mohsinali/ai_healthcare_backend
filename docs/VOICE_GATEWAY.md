# Voice Gateway Foundation

## Purpose and security boundary

The Voice Gateway is the machine-facing boundary between future external voice infrastructure and the core SaaS. It does not make patient, scheduling, appointment, FAQ, location, service, or provider business decisions.

The LLM or external voice provider must never choose the Tenant. The SaaS resolves Tenant and optional Location from trusted inbound telephony metadata through the existing `InboundNumberResolverService`.

Web and voice requests establish authority differently:

```text
Web:   user JWT -> active TenantMembership -> TrustedTenantContext
Voice: machine API key -> calledNumber -> InboundNumberResolverService -> VoiceContext
```

`@Public()` on the voice controller bypasses the global clinic-user JWT guard only. `VoiceServiceAuthGuard` remains attached to the controller and requires its dedicated credential. A clinic JWT does not satisfy it, and the machine credential does not create a User, membership, or `TrustedTenantContext`.

## Endpoint and flow

The application uses the global `api` prefix and URI versioning, so the route is:

```http
POST /api/v1/voice/bootstrap
Authorization: Bearer <VOICE_GATEWAY_API_KEY>
Content-Type: application/json

{"calledNumber":"+1 305 555 1001"}
```

Only `calledNumber` is accepted. Unknown properties such as `tenantId` and `locationId` are rejected by the global validation pipe. The resolver performs the existing canonical phone normalization and database lookup; the gateway has no duplicate phone parser or query.

An active location-specific number returns its trusted tenant, location, and the location's scheduling timezone. A tenant-wide number returns `null` for `locationId`, `locationName`, and `timezone`; no default location is invented.

The server-side `VoiceContext` also retains the telephony record ID, provider, and optional escalation destination for trusted future server code. The external response intentionally exposes only:

```json
{
  "context": {
    "tenantId": "tenant-id",
    "tenantName": "Sunshine Medical",
    "locationId": "location-id",
    "locationName": "Downtown Clinic",
    "timezone": "America/New_York"
  },
  "calledNumber": "+13055551001"
}
```

Bootstrap is stateless. It creates no call/session record and issues no user or context JWT.

## Failure and data handling

- Missing, malformed, or invalid machine credentials return `401` without revealing the configured key.
- Invalid request shape or a malformed phone number returns `400`.
- Unknown, inactive-number, inactive-tenant, and inactive-location outcomes all return the same safe `404`: `Inbound voice destination is unavailable.` No fallback tenant or location is used.
- Unexpected dependency failures continue through the shared exception filter and do not expose Prisma, SQL, or stack details.
- Logs contain a structured event, internal resolution outcome, provider, and whether the route is location-scoped. They omit Authorization, API keys, request bodies, phone numbers, and PHI.
- Bootstrap processes no patient, appointment, clinical, transcript, or recording data.

The endpoint is limited to 60 requests per minute per the existing process-local Nest throttler. In a horizontally scaled deployment this limit is per instance; a shared limiter can be introduced with the broader production scaling design.

Non-production Swagger documents a separate `voice-service` Bearer scheme. Production Swagger behavior is unchanged.

## Configuration

Set a separate, high-entropy secret of at least 32 characters:

```dotenv
VOICE_GATEWAY_API_KEY=<secure-random-machine-secret>
```

There is no default. Environment validation fails startup in every environment when it is missing or weak, including production. Tests set an explicit test-only value. Never expose this value to the frontend or log it.

Stage 1 supports one active key. Future production hardening may add multiple key IDs, overlap windows, rotation, HMAC request signing, and provider-specific credentials.

## Future voice tools

The same machine credential may initially protect bootstrap and narrow future voice tools, but machine authentication alone is not tenant authorization. Every tool must receive context derived or revalidated from trusted inbound metadata; it must not accept an arbitrary tenant identity. A short-lived signed call-context token or persisted call session can be considered when a real provider integration makes it necessary.

This foundation includes no Twilio or ElevenLabs integration, webhooks, audio, voice tools, transfers, call persistence, transcripts, recordings, Redis, or queues.

## Manual verification

1. Configure an active location-scoped telephony number such as `+1 305 555 1001`, and set `VOICE_GATEWAY_API_KEY` locally.
2. Send the request above without Authorization, with the wrong scheme, and with an invalid key; each must return `401`.
3. Send it with the correct key; it must return `200`, the number normalized as `+13055551001`, the mapped tenant/location, and the location timezone. It must contain no patient, appointment, or FAQ data.
4. Send the normalized form and verify the same context.
5. Test an active tenant-wide number and verify all location fields are `null`.
6. Test an unknown number, then deactivate the number, tenant, and mapped location in turn. Each unavailable destination must return the generalized `404` without context.
7. Add `"tenantId":"another-tenant"` or `"locationId":"another-location"` to the body and verify `400`.
8. Send a valid clinic-user JWT without the machine key and verify `401`.
9. Inspect response and application logs and verify the machine key and full inbound number are absent.
