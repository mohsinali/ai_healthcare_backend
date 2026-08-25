CREATE TYPE "SequenceType" AS ENUM ('APPOINTMENT');

CREATE TABLE "Sequence" (
  "id" UUID NOT NULL,
  "tenantId" UUID NOT NULL,
  "type" "SequenceType" NOT NULL,
  "prefix" TEXT NOT NULL,
  "nextValue" INTEGER NOT NULL DEFAULT 1,
  "padding" INTEGER NOT NULL DEFAULT 2,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Sequence_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Sequence_tenantId_type_key" ON "Sequence"("tenantId", "type");

ALTER TABLE "Sequence" ADD CONSTRAINT "Sequence_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

-- AppointmentSequence.nextValue already represents the next value to allocate,
-- so it is copied without adjustment. Existing Appointment identifiers are not changed.
INSERT INTO "Sequence" (
  "id", "tenantId", "type", "prefix", "nextValue", "padding", "createdAt", "updatedAt"
)
SELECT
  gen_random_uuid(),
  "tenantId",
  'APPOINTMENT'::"SequenceType",
  'APT-',
  "nextValue",
  2,
  CURRENT_TIMESTAMP,
  "updatedAt"
FROM "AppointmentSequence";

DROP TABLE "AppointmentSequence";
