-- CreateEnum
CREATE TYPE "TelephonyProvider" AS ENUM ('TWILIO');

-- CreateEnum
CREATE TYPE "TelephonyNumberStatus" AS ENUM ('ACTIVE', 'INACTIVE');

-- CreateTable
CREATE TABLE "TelephonyNumber" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "locationId" UUID,
    "phoneNumber" TEXT NOT NULL,
    "provider" "TelephonyProvider" NOT NULL,
    "providerPhoneNumberId" TEXT,
    "status" "TelephonyNumberStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TelephonyNumber_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "TelephonyNumber_phoneNumber_key" ON "TelephonyNumber"("phoneNumber");
CREATE UNIQUE INDEX "TelephonyNumber_tenantId_id_key" ON "TelephonyNumber"("tenantId", "id");
CREATE INDEX "TelephonyNumber_tenantId_idx" ON "TelephonyNumber"("tenantId");
CREATE INDEX "TelephonyNumber_tenantId_status_idx" ON "TelephonyNumber"("tenantId", "status");
CREATE INDEX "TelephonyNumber_tenantId_locationId_idx" ON "TelephonyNumber"("tenantId", "locationId");
CREATE INDEX "TelephonyNumber_provider_providerPhoneNumberId_idx" ON "TelephonyNumber"("provider", "providerPhoneNumberId");

ALTER TABLE "TelephonyNumber" ADD CONSTRAINT "TelephonyNumber_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "TelephonyNumber" ADD CONSTRAINT "TelephonyNumber_tenantId_locationId_fkey" FOREIGN KEY ("tenantId", "locationId") REFERENCES "Location"("tenantId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
