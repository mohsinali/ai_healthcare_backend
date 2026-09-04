# Voice appointment rescheduling

`POST /api/v1/voice/tools/reschedule-appointment` lets a verified patient preview and confirm a date/time change for the single appointment privately selected by `search_appointments`.

## Authentication and request

The request requires `Authorization: Bearer <VOICE_GATEWAY_API_KEY>`, `X-Voice-Widget-Key`, `X-Voice-Session-Token`, and `Content-Type: application/json`. The gateway, widget/channel, tenant, and unexpired session are validated in the same way as the other voice tools.

```json
{
  "appointmentDate": "2026-09-12",
  "startTime": "14:30",
  "confirmed": false
}
```

All three fields are required. Dates and times use strict `YYYY-MM-DD` and zero-padded `HH:mm`; `confirmed` must be a JSON boolean. Unknown fields are rejected. In particular, the tool never accepts an appointment/reference, patient, tenant, provider, service, location, timezone, duration, end time, or status.

## Secure selection and confirmation

The patient must first complete `identify_patient` and `verify_patient`, then use `search_appointments` until exactly one appointment is selected. The appointment ID remains only in Redis and is bound to the verified patient identity/version and trusted tenant. PostgreSQL ownership and eligibility are revalidated for every preview and mutation. Missing, stale, foreign, or invalid selections return a generic `appointment_selection_required` result and disclose no appointment data.

With `confirmed: false`, the service validates the replacement and returns `confirmation_required` with privacy-safe current and proposed summaries without changing the database. The exact date/time proposal is stored in versioned session state. A subsequent `confirmed: true` request must atomically consume the matching proposal; a changed proposal receives a fresh preview. A new appointment search/selection or patient identification clears the proposal. Redis reads never refresh expiration and writes use `KEEPTTL`, preserving the session's absolute expiry.

After success, the same appointment remains securely selected and the pending proposal is cleared. Repeating a successful request therefore requires another preview; requesting the authoritative current slot is handled safely as a no-change success.

## Stage 1 scheduling rules

Only `startAt` and the duration-derived `endAt` change. Patient, provider, service, location, public appointment reference, status, and all other relationships remain unchanged. Cancellation and provider/service/location changes are outside this endpoint.

The selected location's IANA timezone is authoritative. The server converts the submitted local wall time to UTC, rejects invalid/nonexistent/ambiguous DST wall times and past times, and formats response date/time back in the location timezone. The authoritative service duration determines the end time.

Preview and mutation revalidate active patient/configuration relationships, location service offering, provider assignment and qualification, location hours, active provider working periods (including split-period boundaries), duration, and provider-wide conflicts across all locations. The current appointment is excluded from overlap checks and back-to-back intervals are allowed.

Confirmed writes run in the existing PostgreSQL transaction using the appointment-record, location-schedule, and provider-schedule advisory locks. Configuration and conflicts are checked under those locks before an in-place update and `RESCHEDULED` event. Failures roll back without changing the original appointment.

## Responses and privacy

Results include `confirmation_required`, `ok`, `verification_required`, `appointment_selection_required`, `appointment_not_reschedulable`, `slot_unavailable`, `invalid_appointment_time`, and `reschedule_failed`. Successful and preview summaries contain only the public reference, local date/start/end, timezone, provider/service/location names, and (for current/successful appointments) status. They never expose internal IDs, patient identity/contact data, notes, database errors, or session/authentication secrets. Operational error logs contain only a fixed tool failure message.

Example preview:

```json
{
  "status": "confirmation_required",
  "message": "Please confirm the proposed appointment change.",
  "currentAppointment": {
    "appointmentReference": "APT-00123",
    "date": "2026-09-08",
    "startTime": "10:30",
    "endTime": "11:00",
    "timezone": "Asia/Karachi",
    "providerName": "Dr. Ali Tahir",
    "serviceName": "Consultation",
    "locationName": "Qureshi Medical Centre",
    "status": "BOOKED"
  },
  "proposedAppointment": {
    "appointmentReference": "APT-00123",
    "date": "2026-09-12",
    "startTime": "14:30",
    "endTime": "15:00",
    "timezone": "Asia/Karachi",
    "providerName": "Dr. Ali Tahir",
    "serviceName": "Consultation",
    "locationName": "Qureshi Medical Centre"
  }
}
```

After API testing, add an ElevenLabs `reschedule_appointment` tool with exactly the three request properties above, all required, `additionalProperties: false`, and the standard gateway/widget/session headers. The live ElevenLabs agent is not changed by this implementation.
