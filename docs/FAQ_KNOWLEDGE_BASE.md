# FAQ / Knowledge Base

## Stage 1 frontend

The clinic-facing module is named **Knowledge Base** and is available at
`/knowledge-base`, `/knowledge-base/new`, `/knowledge-base/[faqId]`, and
`/knowledge-base/[faqId]/edit`. UUIDs remain internal route identifiers while
the UI displays the tenant sequence value (`FAQ-01`, `FAQ-02`, and so on).

Frontend API access is centralized in `src/faqs/api.ts`. List keys use
`["faqs", tenantId, filters]`, detail keys use `["faq", tenantId, faqId]`, and
location choices use `["faq-locations", tenantId]`. Tenant selection removes
tenant-scoped queries, preventing records from a previous clinic from being
displayed after a switch.

Clinic owners and admins can add, edit, activate, and deactivate entries.
Receptionists have list/detail access only. There is no hard-delete action.
Categories are displayed with title-cased labels, and scope is either **All
Locations** (`locationId: null`) or one tenant Location. The shared Add/Edit
form performs one API mutation from one submit button. Its lightweight keyword
editor trims input, rejects case-insensitive duplicates, and limits entries to
20 keywords of 100 characters each.

Search is server-side through the existing `search` parameter across question,
answer, and keywords. Category, status, location, and pagination also use the
existing backend contract. Knowledge Base content is clinic-approved structured
FAQ data stored in the Core SaaS backend. Stage 1 does not include documents,
RAG, vector search, AI generation, or Voice integration; those remain future
milestones.

## Backend foundation

The FAQ module stores clinic-approved operational information in the authoritative Core SaaS PostgreSQL database. A future AI or voice layer may formulate natural-language responses from approved FAQ records, but it will not own persistence or become the source of truth.

## Domain model

`FAQ.id` is the internal UUID. `FAQ.faqNumber` is an immutable, tenant-scoped display identifier allocated by the existing atomic `SequenceService`. `SequenceType.FAQ` defaults to prefix `FAQ-`, minimum padding `2`, and an independent counter per tenant and entity type (`FAQ-01`, `FAQ-99`, `FAQ-100`).

Each FAQ belongs to one tenant. A null `locationId` means tenant-wide content; a UUID scopes the FAQ to exactly one location in the same tenant. The composite foreign key prevents cross-tenant associations. Location and tenant hard deletion are restricted so content is not silently erased.

Categories are `GENERAL`, `HOURS`, `LOCATION`, `PARKING`, `APPOINTMENTS`, `INSURANCE`, `PAYMENTS`, `SERVICES`, `PREPARATION`, `POLICIES`, `ACCESSIBILITY`, and `OTHER`. Status is `ACTIVE` or `INACTIVE`, defaulting to `ACTIVE`. Normal operation uses the status endpoint, not hard deletion.

Questions are trimmed plain text up to 500 characters; answers are trimmed plain text up to 8,000. Up to 20 keywords of 100 characters each are trimmed, empty values removed, and deduplicated case-insensitively while retaining the first spelling. Canonical keywords remain PostgreSQL `String[]`. A private lower-cased projection supports safe Prisma partial matching and is not returned by the API.

## API and access

All routes are under `/api/v1/faqs`, require authentication, `X-Tenant-Id`, an active tenant membership, and trusted `TenantContext`:

- `GET /faqs`: paginated list with `search`, `status`, `category`, and `locationId` filters; sorted by `updatedAt DESC, id DESC`.
- `POST /faqs`: create and allocate `faqNumber` server-side.
- `GET /faqs/:faqId`: tenant-scoped detail.
- `PATCH /faqs/:faqId`: update location, category, question, answer, or keywords.
- `PATCH /faqs/:faqId/status`: activate or deactivate.

Clinic owners and admins can read and mutate. Receptionists are read-only. IDs belonging to another tenant return the same not-found behavior as missing IDs, and submitted `tenantId`/`faqNumber` fields fail strict DTO validation. Platform `SUPER_ADMIN` does not bypass tenant membership.

Search is deterministic, case-insensitive substring matching over question and answer plus a normalized keyword projection. It is not fuzzy or semantic and does not rank relevance. The internal `searchApprovedFAQs` path enforces ACTIVE records and supports location-specific plus tenant-wide fallback candidates; no public voice endpoint exists. Future location precedence/ranking should prefer location-specific content before tenant-wide fallback.

This milestone contains no frontend, uploads, crawling, embeddings, vector database, RAG, LLM generation, ElevenLabs, Twilio, n8n, or external integration work.
