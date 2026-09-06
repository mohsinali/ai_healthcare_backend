# Voice appointment cancellation

`POST /api/v1/voice/tools/cancel-appointment` lets a verified patient preview and explicitly confirm cancellation of the one upcoming appointment privately selected by `search_appointments`.

## Authentication and request

Required headers are `Authorization: Bearer <VOICE_GATEWAY_API_KEY>`, `X-Voice-Widget-Key`, `X-Voice-Session-Token`, and `Content-Type: application/json`. The endpoint uses the standard voice gateway guard, trusted widget/channel resolution, 10-per-minute mutation throttle, and the absolute 1,800-second voice-session expiry.

The body has exactly one required, strict boolean field. Global validation rejects unknown fields and values such as `"true"`.

```json
{ "confirmed": false }
```

Never send an appointment ID, reference, patient/tenant ID, date, time, reason, or other appointment data to this tool.

## Secure flow

The patient completes `identify_patient` and `verify_patient`, then calls `search_appointments` until exactly one upcoming `BOOKED` or `CONFIRMED` appointment is selected. Zero or multiple matches leave no cancellable selection. The internal appointment ID remains in Redis and is bound to the trusted session, tenant, channel, verified patient identity/version, and selection version.

1. Call with `confirmed: false`. PostgreSQL revalidates tenant and patient ownership, current status, future start time, and appointment relationships under the appointment-record lock. No mutation occurs. A `confirmation_required` response returns only the public reference, location-local date/time, timezone, provider, service, location, and status. Its message states that cancellation has not happened.
2. Read that appointment back and ask a direct confirmation question.
3. Only after a clear affirmative response, call the same tool with `confirmed: true`. A direct confirmed call without a matching preview creates a preview and returns `confirmation_required`; it never mutates.
4. The confirmed call atomically consumes a Redis confirmation bound to the identity/selection versions and the appointment's `updatedAt` marker. The transaction locks and reloads the record, revalidates ownership, marker, eligibility, then acquires the provider scheduling lock and updates the existing record to `CANCELLED`, sets `cancelledAt`, and adds a `CANCELLED` event. The record, public reference, relationships, date/time, and duration are preserved.

Redis Lua updates use `KEEPTTL`; reads do not refresh expiry. Re-identification, a new/unsafe selection, a reschedule preview, successful cancellation, or selection clearing removes pending cancellation state. Malformed or unavailable Redis state fails closed.

## Eligibility and concurrency

Future `BOOKED` and `CONFIRMED` appointments are cancellable. Past, `COMPLETED`, and `NO_SHOW` appointments return `appointment_not_cancellable`. An already `CANCELLED` record is an idempotent domain success and is not updated again. In ordinary voice use it will no longer be returned by `search_appointments`.

The confirmed transaction follows the established lock order: appointment record, then provider schedule. The `updatedAt` preview marker prevents a cancellation from authorizing a record changed after preview. Duplicate cancellation and cancellation/rescheduling races serialize on the appointment record; only an authoritative eligible state can be mutated.

## Responses

- `verification_required`: no appointment data; identify and verify first.
- `appointment_selection_required`: no appointment data; run `search_appointments` and clarify without guessing.
- `confirmation_required`: safe appointment preview; explicitly ask whether to cancel.
- `appointment_not_cancellable`: the selected appointment is ineligible; do not invent a reason.
- `ok`: authoritative cancelled appointment, or safe idempotent already-cancelled success.
- `cancellation_failed`: neutral transient failure; do not claim cancellation.

Example preview:

```json
{
  "status": "confirmation_required",
  "message": "Please confirm that this appointment should be cancelled. It has not been cancelled yet.",
  "appointment": {
    "appointmentReference": "APT-00123",
    "date": "2026-09-12",
    "startTime": "14:30",
    "endTime": "15:00",
    "timezone": "Asia/Karachi",
    "providerName": "Dr. Ali Tahir",
    "serviceName": "Consultation",
    "locationName": "Qureshi Medical Centre",
    "status": "BOOKED"
  }
}
```

Example confirmation request and response:

```json
{ "confirmed": true }
```

```json
{
  "status": "ok",
  "message": "The appointment was cancelled successfully.",
  "appointment": {
    "appointmentReference": "APT-00123",
    "date": "2026-09-12",
    "startTime": "14:30",
    "endTime": "15:00",
    "timezone": "Asia/Karachi",
    "providerName": "Dr. Ali Tahir",
    "serviceName": "Consultation",
    "locationName": "Qureshi Medical Centre",
    "status": "CANCELLED"
  }
}
```

## ElevenLabs tool schema

Configure `cancel_appointment` as an HTTP POST to `/api/v1/voice/tools/cancel-appointment` with the standard gateway/widget/session headers. Its JSON Schema is:

```json
{
  "type": "object",
  "properties": { "confirmed": { "type": "boolean" } },
  "required": ["confirmed"],
  "additionalProperties": false
}
```

The backend implementation does not modify or publish the live ElevenLabs agent.
