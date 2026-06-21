-- Run once against production if deploy db push has not run yet.
-- Safe to re-run: uses IF NOT EXISTS where supported.

DO $$ BEGIN
  CREATE TYPE "PhoneNumberType" AS ENUM ('PRIMARY', 'TRACKING', 'AGENT_DIRECT');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE "PhoneNumber" ADD COLUMN IF NOT EXISTS "numberType" "PhoneNumberType" NOT NULL DEFAULT 'TRACKING';
ALTER TABLE "PhoneNumber" ADD COLUMN IF NOT EXISTS "assignedUserId" TEXT;
ALTER TABLE "PhoneNumber" ADD COLUMN IF NOT EXISTS "trackingSource" TEXT;
ALTER TABLE "PhoneNumber" ADD COLUMN IF NOT EXISTS "callFlowId" TEXT;
ALTER TABLE "PhoneNumber" ADD COLUMN IF NOT EXISTS "isPrimary" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "PhoneNumber" ADD COLUMN IF NOT EXISTS "twilioSid" TEXT;

DO $$ BEGIN
  ALTER TABLE "PhoneNumber"
    ADD CONSTRAINT "PhoneNumber_assignedUserId_fkey"
    FOREIGN KEY ("assignedUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "PhoneNumber"
    ADD CONSTRAINT "PhoneNumber_callFlowId_fkey"
    FOREIGN KEY ("callFlowId") REFERENCES "CallFlow"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
