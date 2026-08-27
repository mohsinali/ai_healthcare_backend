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

## Manual verification

1. Log in as `CLINIC_OWNER`, select a tenant with `X-Tenant-Id`, and `POST /api/v1/web-voice-channels` with `{ "locationId": null }`.
2. Confirm the response contains a generated `wgt_...` key and default `ACTIVE` status, but no tenant ownership can be supplied in the body.
3. With exactly one active location, post the key to `/api/v1/voice/web/session`; confirm the public context reports that location as resolved.
4. Add a second active location and repeat; confirm `locationResolved` is false and `locationName` is null.
5. Create a channel with a specific active `locationId` and confirm it always resolves that location. Try a location owned by another tenant and confirm rejection.
6. Configure local `ELEVENLABS_API_KEY` and `ELEVENLABS_AGENT_ID`, request a session, and confirm a real `signedUrl` is returned without the API key, database IDs, patient, or appointment data.
7. Try a malformed/unknown key, then deactivate the channel through `PATCH /api/v1/web-voice-channels/:id/status`; both session attempts must fail safely before ElevenLabs is called.
8. Confirm `RECEPTIONIST` can list/get channels but receives 403 for create/update/status. Confirm tenant A cannot retrieve or update tenant B records.
9. Confirm `/api/v1/voice/bootstrap` still requires the Voice Gateway credential.
