-- CreateEnum
CREATE TYPE "WebVoiceChannelStatus" AS ENUM ('ACTIVE', 'INACTIVE');

-- CreateTable
CREATE TABLE "WebVoiceChannel" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "locationId" UUID,
    "publicWidgetKey" TEXT NOT NULL,
    "agentId" TEXT,
    "status" "WebVoiceChannelStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WebVoiceChannel_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "WebVoiceChannel_publicWidgetKey_key" ON "WebVoiceChannel"("publicWidgetKey");
CREATE UNIQUE INDEX "WebVoiceChannel_tenantId_id_key" ON "WebVoiceChannel"("tenantId", "id");
CREATE INDEX "WebVoiceChannel_tenantId_idx" ON "WebVoiceChannel"("tenantId");
CREATE INDEX "WebVoiceChannel_tenantId_status_idx" ON "WebVoiceChannel"("tenantId", "status");
CREATE INDEX "WebVoiceChannel_tenantId_locationId_idx" ON "WebVoiceChannel"("tenantId", "locationId");

ALTER TABLE "WebVoiceChannel" ADD CONSTRAINT "WebVoiceChannel_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "WebVoiceChannel" ADD CONSTRAINT "WebVoiceChannel_tenantId_locationId_fkey" FOREIGN KEY ("tenantId", "locationId") REFERENCES "Location"("tenantId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
