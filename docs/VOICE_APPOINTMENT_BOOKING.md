# ElevenLabs appointment booking tool

`POST /api/v1/voice/tools/book-appointment` books an appointment for a verified existing patient. It uses the same voice machine authentication, widget key, authenticated Redis session token, selected session location, and throttling conventions as the other voice tools.

The JSON body is:

```json
{
  "serviceName": "General Consultation",
  "providerName": "Dr. Sarah Ahmed",
  "appointmentDate": "2026-09-10",
  "startTime": "10:30",
  "confirmed": true
}
```

`appointmentDate` and `startTime` intentionally match the `localDate` and `localTime` values returned by `search-availability`. The backend interprets them in the selected location's trusted timezone and calculates the end time from the configured service duration. Unknown body properties are rejected by the global validation pipe.

Before calling this tool, ElevenLabs must summarize the selected location, service, provider, appointment date, and start time, then receive an explicit affirmative response from the caller. Calling the tool is not itself confirmation. `confirmed` must be present and exactly `true`; otherwise the tool returns `confirmation_required` and performs no booking.

Tenant, patient, location, service, and provider IDs are never accepted from ElevenLabs. Tenant comes from trusted `VoiceContext`; location and verified-patient state come from the authenticated Redis voice session. Redis failure fails closed.

Booking revalidates active configuration, location/service/provider relationships, provider qualification, local wall time, service duration, business hours, future time, and provider conflicts. It uses the scheduler's PostgreSQL transaction-scoped advisory lock for the tenant/provider/local-date tuple. Under that lock, an existing active appointment with the same tenant, patient, location, service, provider, and start time is returned as the successful idempotent result; otherwise the final overlap check and insert occur in the same transaction. No schema change or caller-provided idempotency key is required.

Responses contain deterministic voice-safe statuses and, on success, only the confirmation code and public appointment summary. They never contain internal IDs, session data, Redis keys, or internal errors.
