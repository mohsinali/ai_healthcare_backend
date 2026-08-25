-- Extend the generic tenant sequence namespace for FAQ business identifiers.
ALTER TYPE "SequenceType" ADD VALUE 'FAQ';

CREATE TYPE "FAQCategory" AS ENUM (
  'GENERAL', 'HOURS', 'LOCATION', 'PARKING', 'APPOINTMENTS', 'INSURANCE',
  'PAYMENTS', 'SERVICES', 'PREPARATION', 'POLICIES', 'ACCESSIBILITY', 'OTHER'
);

CREATE TYPE "FAQStatus" AS ENUM ('ACTIVE', 'INACTIVE');

CREATE TABLE "FAQ" (
  "id" UUID NOT NULL,
  "tenantId" UUID NOT NULL,
  "faqNumber" TEXT NOT NULL,
  "locationId" UUID,
  "category" "FAQCategory" NOT NULL,
  "question" VARCHAR(500) NOT NULL,
  "answer" VARCHAR(8000) NOT NULL,
  "keywords" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "keywordSearchText" VARCHAR(2019) NOT NULL DEFAULT '',
  "status" "FAQStatus" NOT NULL DEFAULT 'ACTIVE',
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "FAQ_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "FAQ_tenantId_id_key" ON "FAQ"("tenantId", "id");
CREATE UNIQUE INDEX "FAQ_tenantId_faqNumber_key" ON "FAQ"("tenantId", "faqNumber");
CREATE INDEX "FAQ_tenantId_status_idx" ON "FAQ"("tenantId", "status");
CREATE INDEX "FAQ_tenantId_category_idx" ON "FAQ"("tenantId", "category");
CREATE INDEX "FAQ_tenantId_locationId_idx" ON "FAQ"("tenantId", "locationId");
CREATE INDEX "FAQ_tenantId_updatedAt_id_idx" ON "FAQ"("tenantId", "updatedAt", "id");

ALTER TABLE "FAQ" ADD CONSTRAINT "FAQ_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "FAQ" ADD CONSTRAINT "FAQ_tenantId_locationId_fkey"
  FOREIGN KEY ("tenantId", "locationId") REFERENCES "Location"("tenantId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
