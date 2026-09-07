-- A nullable key identifies channels created by a provisioning workflow.
-- PostgreSQL permits multiple NULL values, so manually-created channels remain unlimited.
ALTER TABLE "WebVoiceChannel" ADD COLUMN "provisioningKey" TEXT;

CREATE UNIQUE INDEX "WebVoiceChannel_tenantId_provisioningKey_key"
ON "WebVoiceChannel"("tenantId", "provisioningKey");
