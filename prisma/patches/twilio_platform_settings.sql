-- Shared A2P Messaging Service SID selected in-app (Settings → Phone numbers → A2P).
CREATE TABLE IF NOT EXISTS "twilio_platform_settings" (
  "id" TEXT NOT NULL,
  "messagingServiceSid" TEXT,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "updatedByUserId" TEXT,
  CONSTRAINT "twilio_platform_settings_pkey" PRIMARY KEY ("id")
);
