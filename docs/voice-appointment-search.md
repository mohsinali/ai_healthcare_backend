# Voice appointment lookup and confirmation

`POST /api/v1/voice/tools/search-appointments` lets a verified patient find and
hear their upcoming appointment details. It is read-only: “confirmation” means
reading the matching details back, not changing appointment status or creating
an RSVP.

## Authentication

Requests require `Authorization: Bearer <VOICE_GATEWAY_API_KEY>`,
`X-Voice-Widget-Key`, `X-Voice-Session-Token`, and `Content-Type:
application/json`. The trusted session supplies tenant and verified-patient
identity. Callers cannot supply either identity, an internal ID, or a timezone.

## Request

All properties are optional:

```json
{
  "appointmentReference": "APT-00123",
  "providerName": "Dr. Ali Tahir",
  "locationName": "Qureshi Medical Centre",
  "startDate": "2026-09-08",
  "endDate": "2026-09-14"
}
```

Unknown properties are rejected. Strings are trimmed. Appointment references
use the generated `APT-<digits>` structure and are compared case-insensitively
after conservative canonicalization. The expected hyphen may be omitted or
spoken as a single space, so `APT-06`, `APT06`, `APT 06`, and lowercase forms
are equivalent. Leading zeroes and every prefix/suffix character remain
meaningful; unsafe punctuation, partial, suffix-only, and fuzzy matches are not
accepted.

When `appointmentReference` is present, it is the complete primary lookup
criterion. Provider, location, and date filters are ignored, including an
unrelated model-supplied `endDate`, while mandatory trusted-tenant,
verified-patient, future-date, and eligible-status restrictions remain. Without
a reference, dates are strict, real `YYYY-MM-DD` dates and ranges are inclusive.
`startDate` alone means that single local calendar day. `endDate` without
`startDate` is rejected. A structurally valid but missing or foreign reference
returns the same privacy-safe `not_found` domain response.

With no filters, the tool searches all future `BOOKED` and `CONFIRMED`
appointments for the verified patient, across all tenant locations. Results
are chronological and limited to five; `hasMore` says whether more matched.
An explicit location narrows the search. Dates and returned `HH:mm` times use
each appointment location's IANA timezone, including DST rules.

Responses use `ok`, `multiple_matches`, `not_found`, or
`verification_required`. Appointment items contain only the public appointment
number, local date and interval, timezone, provider, service, location, and
safe status. Patient data and all database IDs are omitted. Cross-patient and
cross-tenant references produce the same `not_found` result.

An exact single match stores its internal ID only in the private Redis voice
session. Multiple or zero matches clear a stale selection. Updates are atomic,
bound to the current verified-patient flow, preserve the original absolute
expiry, and fail closed. Later mutation tools must still re-check database
ownership and eligibility.

Example single-match response:

```json
{
  "status": "ok",
  "appointment": {
    "appointmentReference": "APT-00123",
    "date": "2026-09-08",
    "startTime": "10:30",
    "endTime": "11:00",
    "timezone": "Asia/Karachi",
    "providerName": "Dr. Ali Tahir",
    "serviceName": "New Patient Consultation",
    "locationName": "Qureshi Medical Centre",
    "status": "BOOKED"
  }
}
```

After API testing, configure an ElevenLabs webhook tool with the endpoint and
headers above. Its object body schema has the five optional string properties
shown in the request; both date descriptions must specify `YYYY-MM-DD`. Do not
publish or modify the live agent as part of this backend step.
