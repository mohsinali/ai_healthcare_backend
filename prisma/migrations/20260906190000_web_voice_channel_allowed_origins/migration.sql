-- Existing channels remain closed to external embedding by default.
ALTER TABLE "WebVoiceChannel"
ADD COLUMN "allowedOrigins" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
