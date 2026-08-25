CREATE TYPE "AppointmentStatus" AS ENUM ('BOOKED', 'CONFIRMED', 'CANCELLED', 'COMPLETED', 'NO_SHOW');
CREATE TYPE "AppointmentEventType" AS ENUM ('CREATED', 'RESCHEDULED', 'CONFIRMED', 'CANCELLED', 'COMPLETED', 'NO_SHOW');

CREATE TABLE "AppointmentSequence" (
  "tenantId" UUID NOT NULL,
  "nextValue" INTEGER NOT NULL DEFAULT 1,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "AppointmentSequence_pkey" PRIMARY KEY ("tenantId")
);

CREATE TABLE "Appointment" (
  "id" UUID NOT NULL,
  "tenantId" UUID NOT NULL,
  "appointmentNumber" TEXT NOT NULL,
  "patientId" UUID NOT NULL,
  "locationId" UUID NOT NULL,
  "providerId" UUID NOT NULL,
  "serviceId" UUID NOT NULL,
  "startAt" TIMESTAMPTZ(3) NOT NULL,
  "endAt" TIMESTAMPTZ(3) NOT NULL,
  "status" "AppointmentStatus" NOT NULL DEFAULT 'BOOKED',
  "reason" VARCHAR(500),
  "notes" VARCHAR(2000),
  "createdByUserId" UUID,
  "cancelledAt" TIMESTAMPTZ(3),
  "cancelledByUserId" UUID,
  "cancellationReason" VARCHAR(500),
  "confirmedAt" TIMESTAMPTZ(3),
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "Appointment_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "AppointmentEvent" (
  "id" UUID NOT NULL,
  "tenantId" UUID NOT NULL,
  "appointmentId" UUID NOT NULL,
  "type" "AppointmentEventType" NOT NULL,
  "actorUserId" UUID,
  "occurredAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "metadata" JSONB,
  CONSTRAINT "AppointmentEvent_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Appointment_tenantId_id_key" ON "Appointment"("tenantId", "id");
CREATE UNIQUE INDEX "Appointment_tenantId_appointmentNumber_key" ON "Appointment"("tenantId", "appointmentNumber");
CREATE INDEX "Appointment_tenantId_startAt_id_idx" ON "Appointment"("tenantId", "startAt", "id");
CREATE INDEX "Appointment_tenantId_patientId_startAt_idx" ON "Appointment"("tenantId", "patientId", "startAt");
CREATE INDEX "Appointment_tenantId_providerId_startAt_idx" ON "Appointment"("tenantId", "providerId", "startAt");
CREATE INDEX "Appointment_tenantId_locationId_startAt_idx" ON "Appointment"("tenantId", "locationId", "startAt");
CREATE INDEX "Appointment_tenantId_status_startAt_idx" ON "Appointment"("tenantId", "status", "startAt");
CREATE INDEX "AppointmentEvent_tenantId_appointmentId_occurredAt_idx" ON "AppointmentEvent"("tenantId", "appointmentId", "occurredAt");

ALTER TABLE "AppointmentSequence" ADD CONSTRAINT "AppointmentSequence_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Appointment" ADD CONSTRAINT "Appointment_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Appointment" ADD CONSTRAINT "Appointment_tenantId_patientId_fkey" FOREIGN KEY ("tenantId", "patientId") REFERENCES "Patient"("tenantId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Appointment" ADD CONSTRAINT "Appointment_tenantId_locationId_fkey" FOREIGN KEY ("tenantId", "locationId") REFERENCES "Location"("tenantId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Appointment" ADD CONSTRAINT "Appointment_tenantId_providerId_fkey" FOREIGN KEY ("tenantId", "providerId") REFERENCES "Provider"("tenantId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Appointment" ADD CONSTRAINT "Appointment_tenantId_serviceId_fkey" FOREIGN KEY ("tenantId", "serviceId") REFERENCES "Service"("tenantId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Appointment" ADD CONSTRAINT "Appointment_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Appointment" ADD CONSTRAINT "Appointment_cancelledByUserId_fkey" FOREIGN KEY ("cancelledByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "AppointmentEvent" ADD CONSTRAINT "AppointmentEvent_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "AppointmentEvent" ADD CONSTRAINT "AppointmentEvent_tenantId_appointmentId_fkey" FOREIGN KEY ("tenantId", "appointmentId") REFERENCES "Appointment"("tenantId", "id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AppointmentEvent" ADD CONSTRAINT "AppointmentEvent_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
