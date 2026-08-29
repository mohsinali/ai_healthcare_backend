# Web Voice Channel foundation

## Architecture

Both inbound channels resolve untrusted public routing data into the same trusted server-side `VoiceContext`:

```text
WEB:   widgetKey   -> WebVoiceChannel -> Tenant + optional Location -> VoiceContext
PHONE: calledNumber -> TelephonyNumber -> Tenant + optional Location -> VoiceContext
```

Business tools consume `VoiceContext` and remain channel-independent. `channel` is `WEB_WIDGET` or `PHONE`. This foundation has no Twilio dependency; the paused phone implementation remains intact and maps to `PHONE`.

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
