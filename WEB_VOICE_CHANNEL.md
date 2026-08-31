# Web Voice Channel foundation

## Architecture

Both inbound channels resolve untrusted public routing data into the same trusted server-side `VoiceContext`:

```text
WEB:   widgetKey   -> WebVoiceChannel -> Tenant + optional Location -> VoiceContext
PHONE: calledNumber -> TelephonyNumber -> Tenant + optional Location -> VoiceContext
```

Business tools consume `VoiceContext` and remain channel-independent. `channel` is `WEB_WIDGET` or `PHONE`. Web tool contexts also contain a trusted internal `voiceSessionId` only after Redis validation; it is never returned in a tool response.

## Redis-backed application voice sessions

`POST /api/v1/voice/web/session` now creates a distinct application-owned session for every request/tab and responds with an ElevenLabs signed URL plus `voiceSessionToken`. The response is `Cache-Control: no-store`. The credential is 32 random bytes encoded as 43 base64url characters. The browser keeps it only in the current startup closure and supplies it to ElevenLabs as `secret__voice_session_token`; it is never stored in browser storage, URLs, logs, PostgreSQL, or Redis.

Redis stores JSON at `voice:session:v1:<sha256(token)>` with state version 1, internal UUID, tenant ID, `WEB_WIDGET`, WebVoiceChannel ID, nullable selected location ID, creation time, and absolute expiry. Default lifetime is 1,800 seconds. Reads never refresh TTL; location updates use the original absolute expiry. Redis loss or unavailability invalidates/fails closed active sessions with controlled 401/503 responses.

Every web voice tool (`faq-search`, `resolve-location`, `search-services`, `search-providers`, and `search-availability`) requires:

- `Authorization: Bearer <VOICE_GATEWAY_API_KEY>`
- `X-Voice-Widget-Key: {{secret__voice_widget_key}}`
- `X-Voice-Session-Token: {{secret__voice_session_token}}`

Configure the two runtime inputs as ElevenLabs **secret dynamic variables**, so they are usable only in webhook headers and are not sent to the LLM. The backend hashes the session token, loads Redis, and verifies tenant, channel, and WebVoiceChannel identity against freshly resolved trusted gateway context. All validation failures use the same expired/invalid response.

The legacy `X-Voice-Selected-Location-Key: {{selected_location_key}}` header is temporarily retained and adapted. It is no longer authoritative: the backend revalidates an active, same-tenant location and binds its database ID to only the current Redis session. `resolve_location` also binds a successful result server-side. All location-dependent tools read the Redis session location. A session may start tenant-wide, and different tabs/sessions remain isolated.

Manual ElevenLabs dashboard configuration and live testing remain pending while credits are unavailable. Add the session-token header to all seven tools and publish the Agent.

## Model and resolution

`WebVoiceChannel` belongs to one tenant and optionally one same-tenant location. It has an immutable, globally unique `publicWidgetKey`, optional server-managed `agentId`, `ACTIVE`/`INACTIVE` status, and timestamps. Keys are generated with 32 cryptographically secure random bytes encoded as `wgt_<base64url>`; they are opaque and are not derived from tenant data. Routine lifecycle changes use status rather than deletion. Key rotation is deliberately deferred because replacing a key requires updating the clinic website.

An active location-specific channel resolves that location. A tenant-wide channel queries active locations deterministically: exactly one is auto-selected; zero or more than one stays tenant-wide with `locationId = null`. This explicitly avoids guessing a location. Future location-specific tools, including scheduling, must require location selection when it is unresolved. Inactive channels, tenants, and explicitly assigned locations cannot resolve.

## Public session endpoint

`POST /api/v1/voice/web/session` accepts only `{ "widgetKey": "wgt_..." }`. It is intentionally anonymous and requires neither a clinic JWT, `X-Tenant-Id`, nor the Voice Gateway machine guard. The global validation policy rejects extra routing or PHI fields. A per-process throttle currently permits 20 requests per 60 seconds; this is only single-instance protection until a distributed limiter is introduced.

The server chooses `WebVoiceChannel.agentId` first, then `ELEVENLABS_AGENT_ID`, and calls the official `GET /v1/convai/conversation/get-signed-url?agent_id=...` endpoint with `ELEVENLABS_API_KEY` in the `xi-api-key` header and a five-second timeout. It returns only the signed URL, tenant/location display names, resolution state, and channel. Provider failures are mapped to a safe 502 and configuration failures to 503. API keys, signed URLs, full widget keys, provider bodies, patient data, and appointment data are not logged or exposed.

Generate a URL only when the visitor clicks **Start a Call**, then use it immediately. ElevenLabs currently documents a 15-minute connection expiry. If connection fails due to expiry, a future frontend may request one fresh URL and retry. Expiry of the original URL does not terminate an established conversation. Signed URLs are neither stored nor cached.

## Security follow-ups

CORS is not authentication. Global CORS remains restricted; embedding on clinic domains will require a per-widget allowed-origin strategy. Domain allowlisting is the next hardening step. A future short-lived signed context token will authenticate browser tool calls; it is intentionally not part of session establishment.

Environment placeholders:

```dotenv
ELEVENLABS_API_KEY=
ELEVENLABS_AGENT_ID=
```

## FAQ voice tool

`POST /api/v1/voice/tools/faq-search` is a machine-authenticated, read-only adapter. It requires both `Authorization: Bearer <VOICE_GATEWAY_API_KEY>` and `X-Voice-Widget-Key: wgt_...`. Machine authentication approves the integration but does not establish a tenant. The server re-resolves the widget key on every request and establishes the trusted tenant before considering the optional `X-Voice-Selected-Location-Key` header.

The effective FAQ scope is resolved in this order: trusted tenant from the widget key; an `ACTIVE` location whose tenant and `locationNumber` match a non-blank conversation `selected_location_key`; otherwise the WebVoiceChannel/default `VoiceContext` location; otherwise tenant-wide FAQs only. The selected key is untrusted until this backend validation succeeds. An explicitly supplied unknown, inactive, or other-tenant key receives the same safe 404 and never falls back or changes tenant identity. A missing or blank header preserves existing default behavior.

The body accepts only a trimmed `query` string of 1–500 characters. Global whitelist validation rejects routing IDs and additional fields. Search returns at most three deterministic matches containing only `question`, approved `answer`, and `TENANT`/`LOCATION` scope. SQL eligibility is always same-tenant, `ACTIVE`, and either tenant-wide plus the exact resolved location or tenant-wide only when location is unresolved. Inactive, other-tenant, and other-location records cannot become candidates. A tenant-wide miss may report `requiresLocation` when a similar active location-specific FAQ exists.

The endpoint is limited to 60 requests per minute by the existing process-local throttler. It logs only channel, whether location resolved, result count, latency, and failure category; it does not log queries, answers, widget keys, credentials, or headers. ElevenLabs must reach it through public HTTPS; browser CORS changes are neither needed nor appropriate.

## Location resolution voice tool

`POST /api/v1/voice/tools/resolve-location` is the single location resolver/listing tool. It uses the same machine authentication and `X-Voice-Widget-Key` trust path as FAQ search. Its only body property is a trimmed `query` string of 1–200 characters; global whitelist validation rejects `tenantId`, `locationId`, `widgetKey`, and every other extra property. Tenant identity always comes from the re-resolved widget channel and cannot change during a conversation.

The service searches only `ACTIVE` locations whose `tenantId` equals trusted `VoiceContext.tenantId`. Matching is deterministic: case-insensitive exact name, normalized exact name, then a unique normalized partial match. A unique result is:

```json
{
  "resolved": true,
  "location": {
    "key": "LOC-001",
    "name": "Clifton",
    "timezone": "Asia/Karachi",
    "address": {
      "line1": "12 Main Road",
      "line2": null,
      "city": "Karachi",
      "stateProvince": "Sindh",
      "postalCode": "75600",
      "country": "PK"
    }
  },
  "matches": []
}
```

`key` is the existing tenant-scoped, unique `locationNumber`, not a database UUID. The successful response maps the existing validated `Location` fields `addressLine1`, optional `addressLine2`, `city`, `stateProvince`, `postalCode`, and two-letter `countryCode` into the caller-facing `address` object (`line1`, `line2`, `city`, `stateProvince`, `postalCode`, and `country`). The agent should speak only available components naturally and must not fabricate missing values. This structured address is authoritative for basic location-address questions and does not need to be duplicated in FAQ knowledge.

The response deliberately excludes the database UUID, `tenantId`, tenant slug, timestamps, email and phone fields, escalation numbers, internal relationships, configuration metadata, and audit data. Any future tool that consumes `key` must revalidate `tenantId`, `status = ACTIVE`, and `locationNumber`; the key is a reference, not authorization. Multiple partial matches return `resolved: false`, `ambiguous: true`, and at most five `{ key, name }` candidates. Clear listing questions return the same compact `{ key, name }` shape, so addresses and timezones are disclosed only after one location resolves. No match returns `resolved: false`, `ambiguous: false`, and an empty `matches` array. The resolver never falls back to the widget default after an explicit miss.

The WebVoiceChannel location is only the initial/default location. The public session response supplies its `locationKey`, `locationName`, and `locationTimezone` when resolved, and the browser initializes `selected_location_key`, `selected_location_name`, and `selected_location_timezone`. A successful `resolve_location` tool call must overwrite those response-assigned ElevenLabs conversation variables; calling the tool again changes the selected location while leaving tenant identity unchanged. If startup is tenant-wide, selected-location variables are omitted.

There is no Redis, `CallSession`, database conversation state, or location history. Current selection lives only in ElevenLabs runtime state. FAQ search receives `selected_location_key` through the dynamic `X-Voice-Selected-Location-Key` webhook header and revalidates it as an active `locationNumber` in the trusted tenant on every request.

## Services and providers voice tools

`POST /api/v1/voice/tools/search-services` accepts an optional trimmed `query` string of at most 200 characters. `POST /api/v1/voice/tools/search-providers` accepts optional trimmed `query` and `serviceName` strings of at most 200 characters. Empty strings are treated as absent. Both use the FAQ tool's machine authentication, trusted widget context, and selected-location header flow. Global whitelist validation rejects every extra body property, including tenant, clinic, location, and database identifiers.

Both tools require an effective active location. An unresolved tenant-wide channel returns `location_required`; it never searches across locations. Queries require the trusted `tenantId`, exact active location, and `ACTIVE` configuration status. Results are ordered deterministically and limited to ten.

Service results contain only location name plus configured service name, public description, and duration. Provider results contain only location name, public display/constructed name, and service names. Provider eligibility is the intersection of an active `Provider`, its stored `ProviderLocation`, and—when filtered by service—its stored `ProviderService`; returned services must also be active and have a stored `LocationService` for the selected location. The schema has no specialty field, so no specialty is inferred or returned. Neither tool reads appointments or patients.

Normal conversational outcomes are HTTP 200 results with `ok`, `no_match`, `location_required`, or, for provider service resolution, `service_not_found`. An existing service with no associated providers returns `no_match` with an empty provider list and does not imply appointment unavailability.

## Availability search voice tool

`POST /api/v1/voice/tools/search-availability` is a read-only search adapter. It never creates, holds, changes, confirms, reschedules, or cancels an appointment and never reads or writes patient data. It uses the same Voice Gateway bearer authentication, trusted widget tenant context, and tenant-validated selected-location header as the directory tools.

The JSON body accepts only:

- `serviceName` (required): trimmed configured service name, maximum 200 characters.
- `providerName` (optional): trimmed provider name, maximum 200 characters; blank means absent.
- `startDate` and `endDate` (optional): clinic-local date-only values in `YYYY-MM-DD` form.
- `timeOfDay` (optional): exactly `any`, `morning`, `afternoon`, or `evening`; omitted means `any`.

Every other property is rejected. In particular, do not configure tenant, clinic, location, service, provider, patient, appointment, duration, or timezone IDs/values as body parameters. Omitted dates search seven clinic-local calendar days beginning with the location's current local date. Ranges are inclusive, bounded to 14 days, and cannot be reversed.

The appointments-domain service calculates 15-minute candidate starts within active location business hours, using the configured positive service duration. A slot cannot extend beyond close. `BOOKED` and `CONFIRMED` appointments block time using `existingStart < candidateEnd AND existingEnd > candidateStart`; `CANCELLED`, `COMPLETED`, and `NO_SHOW` do not block. Only future slots are returned. Time-of-day boundaries are clinic-local: morning is before 12:00, afternoon is 12:00 through before 17:00, and evening is 17:00 onward. Luxon applies the location's IANA timezone and DST rules; ambiguous fallback candidate times are omitted. Results sort by start and then provider name and expose at most five numbered options.

Service eligibility requires an active same-tenant service with a stored `LocationService`. Provider eligibility requires an active same-tenant provider with both a stored `ProviderLocation` for the selected location and `ProviderService` for the service. The domain revalidates all of these trusted identifiers. Normal HTTP 200 statuses are `ok`, `no_availability`, `location_required`, `service_not_found`, `provider_not_found`, and `provider_not_qualified`. Responses contain display names, service duration, local offset-aware slot boundaries, and no UUIDs or internal metadata.

The current schema does not represent provider-specific working hours, closures, holidays, time off, or schedule exceptions. Until those are modeled, availability uses active location business hours for every eligible provider. Search results are informational and must be rechecked atomically by a future booking flow.

### Exact ElevenLabs `search_availability` configuration

- Name: `search_availability`
- Description: `Search open appointment times for a configured service at the current selected clinic location. Optionally search for a named provider and a clinic-local date range or time of day. Results are informational only and do not book or reserve a slot.`
- Method: `POST`
- Endpoint: `https://<backend-public-host>/api/v1/voice/tools/search-availability`
- Authentication: secret `Authorization` header with value `Bearer <VOICE_GATEWAY_API_KEY>`
- Dynamic header: `X-Voice-Widget-Key` = `secret__voice_widget_key`
- Dynamic header: `X-Voice-Selected-Location-Key` = `selected_location_key`
- Body description: `Search criteria supplied from the conversation. Send serviceName and only the optional caller preferences that are known. Never send internal identifiers, patient information, duration, or timezone.`
- `serviceName` (string, required): `The configured service requested by the caller, such as General Consultation. Maximum 200 characters.`
- `providerName` (string, optional): `The particular provider requested by the caller. Omit when the caller has no preference. Maximum 200 characters.`
- `startDate` (string, optional): `First clinic-local search date in YYYY-MM-DD format. Omit to begin on the clinic's current local date.`
- `endDate` (string, optional): `Last clinic-local search date in YYYY-MM-DD format, inclusive and no more than 14 days from startDate.`
- `timeOfDay` (string enum, optional): `Clinic-local preference. One of any, morning, afternoon, or evening. Omit or use any when there is no preference.`

Example body:

```json
{
  "serviceName": "General Consultation",
  "providerName": "Dr. Sarah Ahmed",
  "startDate": "2026-09-01",
  "endDate": "2026-09-07",
  "timeOfDay": "morning"
}
```

Example successful response:

```json
{
  "status": "ok",
  "location": { "name": "Downtown Clinic", "timezone": "America/New_York" },
  "service": { "name": "General Consultation", "durationMinutes": 30 },
  "requestedProvider": "Dr. Sarah Ahmed",
  "slots": [
    {
      "option": 1,
      "providerName": "Dr. Sarah Ahmed",
      "localDate": "2026-09-01",
      "localTime": "09:00",
      "startsAt": "2026-09-01T09:00:00.000-04:00",
      "endsAt": "2026-09-01T09:30:00.000-04:00"
    }
  ],
  "message": "One appointment time was found."
}
```

Example expected no-result response:

```json
{
  "status": "no_availability",
  "location": { "name": "Downtown Clinic", "timezone": "America/New_York" },
  "service": { "name": "General Consultation", "durationMinutes": 30 },
  "requestedProvider": null,
  "slots": [],
  "message": "No appointment times were found for General Consultation in the requested range."
}
```

Configure two ElevenLabs webhook tools named `search_services` and `search_providers`. Both use `POST`, the existing Voice Gateway bearer secret, dynamic `X-Voice-Widget-Key: secret__voice_widget_key`, and dynamic `X-Voice-Selected-Location-Key: selected_location_key`. The service body exposes only optional `query`; the provider body exposes only optional `query` and `serviceName`. Do not configure any routing or ID body parameters. After adding the tools, copy the canonical frontend System Prompt, save, and **PUBLISH** the Agent.

### ElevenLabs webhook configuration

- Name: `resolve_location`
- Description: `Resolve or list clinic locations for the current caller. Use this tool when the caller specifies, asks about, changes, or needs to choose a clinic location. Never guess a location.`
- Method: `POST`
- URL: `https://<backend-public-host>/api/v1/voice/tools/resolve-location`
- `Authorization`: existing Voice Gateway bearer secret
- `X-Voice-Widget-Key`: dynamic variable `secret__voice_widget_key`
- JSON body: `query`, supplied from the caller's request
- Response assignments on successful resolution: `location.key` to `selected_location_key`, `location.name` to `selected_location_name`, and `location.timezone` to `selected_location_timezone`. Configure assignments only for `resolved = true`, so ambiguous/not-found calls cannot replace the current selection.

Do not configure tenant or location identifiers as LLM-supplied parameters. The model supplies only `query`; returned location keys must never be spoken to the caller.

After changing the tool schema or canonical prompt, copy the configuration to ElevenLabs, save it, and **PUBLISH** the Agent manually. Saving without publishing does not update application conversations. Do not make paid/live ElevenLabs calls as part of automated verification.

### Agent System Prompt

The complete production ElevenLabs System Prompt, including location resolution behavior, is maintained in `ai_healthcare_frontend/docs/voice/elevenlabs-system-prompt.md`. This document remains authoritative for the webhook contract and response assignments, but it is not a second source of Agent prompt text. Copy and publish only the single canonical prompt block from that file.

## Patient identification and verification tools

Both tools use `POST`, `Authorization: Bearer <VOICE_GATEWAY_API_KEY>`, `X-Voice-Widget-Key: {{secret__voice_widget_key}}`, and `X-Voice-Session-Token: {{secret__voice_session_token}}`. They resolve the same trusted Redis session as every other web voice tool. Do not configure tenant, patient, location, widget, session, candidate, attempt, lockout, or verified-state body properties.

### `identify_patient`

- URL: `https://<backend-public-host>/api/v1/voice/tools/identify-patient`
- Description: `Begin privacy-preserving identification of an existing patient before a future appointment workflow. Supply the caller's first name, last name, and date of birth. The result never indicates whether a matching record exists.`
- Body description: `Basic patient information supplied by the caller. Use date-only YYYY-MM-DD. Do not send internal identifiers or other personal or medical information.`
- `firstName` (string, required, maximum 80): `Patient's first name.`
- `lastName` (string, required, maximum 80): `Patient's last name.`
- `dateOfBirth` (string, required): `Patient's date of birth in strict YYYY-MM-DD format.`
- Effective throttle: 5 requests per 60 seconds per existing NestJS throttler tracking scope.

```json
{
  "firstName": "Jane",
  "lastName": "Doe",
  "dateOfBirth": "1985-04-17"
}
```

When unlocked, every zero, one, or multiple-match outcome is identical: `verification_required`. A locked session returns `manual_verification_required`.

### `verify_patient`

- URL: `https://<backend-public-host>/api/v1/voice/tools/verify-patient`
- Description: `Verify the previously identified existing patient using the phone number registered with the clinic. The result never reveals which input failed or any patient information.`
- Body description: `The registered patient phone number supplied by the caller. Do not send caller ID, internal identifiers, or reset/attempt state.`
- `phoneNumber` (string, required, maximum 30): `Registered international phone number, such as +1 416 555 0123.`
- Effective throttle: 6 requests per 60 seconds per existing NestJS throttler tracking scope.

```json
{
  "phoneNumber": "+1 416 555 0123"
}
```

Structured HTTP 200 statuses are:

- `identification_required`: identification has not been performed in this flow.
- `not_verified`: verification failed before the third failed attempt.
- `verified`: exactly one active same-tenant candidate matched the exact normalized phone.
- `manual_verification_required`: the third failure locked the session, or the session was already locked.

Exact response messages:

| Status | Message |
| --- | --- |
| `verification_required` | `Please provide the phone number registered with the clinic to continue verification.` |
| `identification_required` | `Patient identification is required before verification.` |
| `not_verified` | `The patient could not be verified. Please try again.` |
| `verified` | `Patient verification was successful.` |
| `manual_verification_required` | `Automated patient verification cannot continue for this conversation.` |

Identification always returns `verification_required` (unless locked) with the message requesting the registered phone number. No response contains patient data, IDs, candidate counts, submitted values, or session state.

### Session and concurrency rules

Patient state is embedded in the existing `voice:session:v1:<sha256(token)>` JSON and contains only internal candidate IDs, an internal verified ID, failed-attempt count, lock flag, identification completion, and flow version. It never stores submitted names, DOB, or phone. Lua compare-and-set operations update the existing key with Redis `KEEPTTL`, preserving its original absolute 30-minute expiry.

Identification replaces candidates, increments the flow version, and clears a prior verified ID, but never resets attempts or lockout. Verification queries only the snapshotted candidates and then atomically applies its result only if the flow version is unchanged. Concurrent stale verification work retries against the newer flow. Failed calls atomically increment attempts; the third locks the session. Success clears candidates and stores only the verified internal ID. Only a genuinely new application session and token can reset lockout; there is no reset endpoint and no durable cross-session lockout.

The internal `VoicePatientVerificationService.getVerifiedPatientId` method is for future backend appointment workflows. It accepts only an already trusted/resolved voice-tool session, reloads Redis, rejects missing/locked verification, and rechecks active same-tenant ownership in PostgreSQL. It is not exposed as an HTTP route.

The application HTTP setup does not log request bodies, and these controllers add no submitted values, candidate IDs, or counts to logs. The current Prisma schema has no `AuditLog` model or durable audit service, so no audit migration or competing logging abstraction was introduced; durable patient-verification audit events remain a follow-up when that application capability exists.

## Manual verification

For a cheap direct tool check, send a machine-authenticated request without invoking ElevenLabs:

```bash
curl -sS -X POST 'https://<backend-public-host>/api/v1/voice/tools/resolve-location' \
  -H 'Authorization: Bearer <VOICE_GATEWAY_API_KEY>' \
  -H 'X-Voice-Widget-Key: wgt_<public-widget-key>' \
  -H 'Content-Type: application/json' \
  --data '{"query":"Qureshi Medical Center"}'
```

Confirm `resolved` is true, the name and structured address are correct, and no database UUID or `tenantId` is present. After publishing the updated Agent, the optional browser smoke test is: “What is the address of Qureshi Medical Center?” It should call `resolve_location`, set the current location, and answer from the returned address without an FAQ call.

1. Log in as `CLINIC_OWNER`, select a tenant with `X-Tenant-Id`, and `POST /api/v1/web-voice-channels` with `{ "locationId": null }`.
2. Confirm the response contains a generated `wgt_...` key and default `ACTIVE` status, but no tenant ownership can be supplied in the body.
3. With exactly one active location, post the key to `/api/v1/voice/web/session`; confirm the public context reports that location as resolved.
4. Add a second active location and repeat; confirm `locationResolved` is false and `locationName` is null.
5. Create a channel with a specific active `locationId` and confirm it always resolves that location. Try a location owned by another tenant and confirm rejection.
6. Configure local `ELEVENLABS_API_KEY` and `ELEVENLABS_AGENT_ID`, request a session, and confirm a real `signedUrl` is returned without the API key, database IDs, patient, or appointment data.
7. Try a malformed/unknown key, then deactivate the channel through `PATCH /api/v1/web-voice-channels/:id/status`; both session attempts must fail safely before ElevenLabs is called.
8. Confirm `RECEPTIONIST` can list/get channels but receives 403 for create/update/status. Confirm tenant A cannot retrieve or update tenant B records.
9. Confirm `/api/v1/voice/bootstrap` still requires the Voice Gateway credential.
