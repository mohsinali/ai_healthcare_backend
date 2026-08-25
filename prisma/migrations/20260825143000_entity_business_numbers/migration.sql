ALTER TABLE "Location" ADD COLUMN "locationNumber" TEXT;
ALTER TABLE "Service" ADD COLUMN "serviceNumber" TEXT;
ALTER TABLE "Provider" ADD COLUMN "providerNumber" TEXT;
ALTER TABLE "Patient" ADD COLUMN "patientNumber" TEXT;

-- Controlled deployment assumption: this migration completes before the new
-- application version accepts writes. createdAt then id gives stable ordering.
WITH ranked AS (
  SELECT "id", row_number() OVER (
    PARTITION BY "tenantId" ORDER BY "createdAt" ASC, "id" ASC
  ) AS value
  FROM "Location"
)
UPDATE "Location" entity
SET "locationNumber" = 'LOC-' || lpad(ranked.value::text, 2, '0')
FROM ranked WHERE entity."id" = ranked."id";

WITH ranked AS (
  SELECT "id", row_number() OVER (
    PARTITION BY "tenantId" ORDER BY "createdAt" ASC, "id" ASC
  ) AS value
  FROM "Service"
)
UPDATE "Service" entity
SET "serviceNumber" = 'SRV-' || lpad(ranked.value::text, 2, '0')
FROM ranked WHERE entity."id" = ranked."id";

WITH ranked AS (
  SELECT "id", row_number() OVER (
    PARTITION BY "tenantId" ORDER BY "createdAt" ASC, "id" ASC
  ) AS value
  FROM "Provider"
)
UPDATE "Provider" entity
SET "providerNumber" = 'PRV-' || lpad(ranked.value::text, 2, '0')
FROM ranked WHERE entity."id" = ranked."id";

WITH ranked AS (
  SELECT "id", row_number() OVER (
    PARTITION BY "tenantId" ORDER BY "createdAt" ASC, "id" ASC
  ) AS value
  FROM "Patient"
)
UPDATE "Patient" entity
SET "patientNumber" = 'PAT-' || lpad(ranked.value::text, 2, '0')
FROM ranked WHERE entity."id" = ranked."id";

INSERT INTO "Sequence" (
  "id", "tenantId", "type", "prefix", "nextValue", "padding", "createdAt", "updatedAt"
)
SELECT gen_random_uuid(), "tenantId", 'LOCATION'::"SequenceType", 'LOC-', count(*) + 1, 2, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM "Location" GROUP BY "tenantId"
ON CONFLICT ("tenantId", "type") DO UPDATE SET
  "prefix" = EXCLUDED."prefix", "nextValue" = EXCLUDED."nextValue",
  "padding" = EXCLUDED."padding", "updatedAt" = CURRENT_TIMESTAMP;

INSERT INTO "Sequence" (
  "id", "tenantId", "type", "prefix", "nextValue", "padding", "createdAt", "updatedAt"
)
SELECT gen_random_uuid(), "tenantId", 'SERVICE'::"SequenceType", 'SRV-', count(*) + 1, 2, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM "Service" GROUP BY "tenantId"
ON CONFLICT ("tenantId", "type") DO UPDATE SET
  "prefix" = EXCLUDED."prefix", "nextValue" = EXCLUDED."nextValue",
  "padding" = EXCLUDED."padding", "updatedAt" = CURRENT_TIMESTAMP;

INSERT INTO "Sequence" (
  "id", "tenantId", "type", "prefix", "nextValue", "padding", "createdAt", "updatedAt"
)
SELECT gen_random_uuid(), "tenantId", 'PROVIDER'::"SequenceType", 'PRV-', count(*) + 1, 2, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM "Provider" GROUP BY "tenantId"
ON CONFLICT ("tenantId", "type") DO UPDATE SET
  "prefix" = EXCLUDED."prefix", "nextValue" = EXCLUDED."nextValue",
  "padding" = EXCLUDED."padding", "updatedAt" = CURRENT_TIMESTAMP;

INSERT INTO "Sequence" (
  "id", "tenantId", "type", "prefix", "nextValue", "padding", "createdAt", "updatedAt"
)
SELECT gen_random_uuid(), "tenantId", 'PATIENT'::"SequenceType", 'PAT-', count(*) + 1, 2, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM "Patient" GROUP BY "tenantId"
ON CONFLICT ("tenantId", "type") DO UPDATE SET
  "prefix" = EXCLUDED."prefix", "nextValue" = EXCLUDED."nextValue",
  "padding" = EXCLUDED."padding", "updatedAt" = CURRENT_TIMESTAMP;

ALTER TABLE "Location" ALTER COLUMN "locationNumber" SET NOT NULL;
ALTER TABLE "Service" ALTER COLUMN "serviceNumber" SET NOT NULL;
ALTER TABLE "Provider" ALTER COLUMN "providerNumber" SET NOT NULL;
ALTER TABLE "Patient" ALTER COLUMN "patientNumber" SET NOT NULL;

CREATE UNIQUE INDEX "Location_tenantId_locationNumber_key" ON "Location"("tenantId", "locationNumber");
CREATE UNIQUE INDEX "Service_tenantId_serviceNumber_key" ON "Service"("tenantId", "serviceNumber");
CREATE UNIQUE INDEX "Provider_tenantId_providerNumber_key" ON "Provider"("tenantId", "providerNumber");
CREATE UNIQUE INDEX "Patient_tenantId_patientNumber_key" ON "Patient"("tenantId", "patientNumber");
