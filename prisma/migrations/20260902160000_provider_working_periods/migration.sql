-- CreateIndex
CREATE UNIQUE INDEX "pl_tenant_provider_location_key" ON "ProviderLocation"("tenantId", "providerId", "locationId");

-- CreateTable
CREATE TABLE "ProviderWorkingPeriod" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "providerId" UUID NOT NULL,
    "locationId" UUID NOT NULL,
    "dayOfWeek" "DayOfWeek" NOT NULL,
    "startTime" VARCHAR(5) NOT NULL,
    "endTime" VARCHAR(5) NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProviderWorkingPeriod_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "ProviderWorkingPeriod_startTime_format_check" CHECK ("startTime" ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'),
    CONSTRAINT "ProviderWorkingPeriod_endTime_format_check" CHECK ("endTime" ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'),
    CONSTRAINT "ProviderWorkingPeriod_time_range_check" CHECK ("startTime" < "endTime")
);

-- CreateIndex
CREATE UNIQUE INDEX "pwp_tenant_id_key" ON "ProviderWorkingPeriod"("tenantId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "pwp_exact_period_key" ON "ProviderWorkingPeriod"("tenantId", "providerId", "locationId", "dayOfWeek", "startTime", "endTime");

-- CreateIndex
CREATE INDEX "pwp_provider_schedule_idx" ON "ProviderWorkingPeriod"("tenantId", "providerId", "locationId", "dayOfWeek", "isActive");

-- CreateIndex
CREATE INDEX "pwp_location_schedule_idx" ON "ProviderWorkingPeriod"("tenantId", "locationId", "dayOfWeek", "isActive");

-- AddForeignKey
ALTER TABLE "ProviderWorkingPeriod" ADD CONSTRAINT "pwp_provider_location_fkey" FOREIGN KEY ("tenantId", "providerId", "locationId") REFERENCES "ProviderLocation"("tenantId", "providerId", "locationId") ON DELETE CASCADE ON UPDATE CASCADE;
