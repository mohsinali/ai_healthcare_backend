CREATE TYPE "PatientStatus" AS ENUM ('ACTIVE', 'INACTIVE');
CREATE TYPE "PreferredContactMethod" AS ENUM ('PHONE', 'EMAIL');

CREATE TABLE "Patient" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "firstName" TEXT NOT NULL,
    "normalizedFirstName" TEXT NOT NULL,
    "middleName" TEXT,
    "lastName" TEXT NOT NULL,
    "normalizedLastName" TEXT NOT NULL,
    "dateOfBirth" DATE NOT NULL,
    "phone" TEXT NOT NULL,
    "email" TEXT,
    "addressLine1" TEXT,
    "addressLine2" TEXT,
    "city" TEXT,
    "stateProvince" TEXT,
    "postalCode" TEXT,
    "countryCode" CHAR(2),
    "preferredContactMethod" "PreferredContactMethod",
    "status" "PatientStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Patient_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "Patient_tenantId_id_key" ON "Patient"("tenantId", "id");
CREATE INDEX "Patient_tenantId_status_idx" ON "Patient"("tenantId", "status");
CREATE INDEX "Patient_tenantId_normalizedLastName_normalizedFirstName_idx" ON "Patient"("tenantId", "normalizedLastName", "normalizedFirstName");
CREATE INDEX "Patient_tenantId_phone_idx" ON "Patient"("tenantId", "phone");
CREATE INDEX "Patient_tenantId_email_idx" ON "Patient"("tenantId", "email");
CREATE INDEX "Patient_tenantId_dateOfBirth_idx" ON "Patient"("tenantId", "dateOfBirth");
ALTER TABLE "Patient" ADD CONSTRAINT "Patient_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
