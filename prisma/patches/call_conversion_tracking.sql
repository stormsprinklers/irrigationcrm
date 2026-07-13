-- Call conversion tracking: attribution fields on CallLog + CallConversion table.
-- Idempotent for Postgres.

DO $$ BEGIN
  CREATE TYPE "CallAttributionMethod" AS ENUM (
    'DIALED_TRACKING_NUMBER',
    'LSA_CALLER_MATCH',
    'PRIMARY_NUMBER',
    'UNKNOWN'
  );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE "CallLog" ADD COLUMN IF NOT EXISTS "phoneNumberId" TEXT;
ALTER TABLE "CallLog" ADD COLUMN IF NOT EXISTS "trackingSource" TEXT;
ALTER TABLE "CallLog" ADD COLUMN IF NOT EXISTS "attributionMethod" "CallAttributionMethod" NOT NULL DEFAULT 'UNKNOWN';
ALTER TABLE "CallLog" ADD COLUMN IF NOT EXISTS "googleLsaLeadId" TEXT;

CREATE TABLE IF NOT EXISTS "CallConversion" (
  "id" TEXT NOT NULL,
  "companyId" TEXT NOT NULL,
  "callLogId" TEXT NOT NULL,
  "callSessionId" TEXT,
  "answeredByUserId" TEXT,
  "disposition" "CallDisposition" NOT NULL DEFAULT 'NONE',
  "booked" BOOLEAN NOT NULL DEFAULT false,
  "visitId" TEXT,
  "attributionMethod" "CallAttributionMethod" NOT NULL DEFAULT 'UNKNOWN',
  "phoneNumberId" TEXT,
  "trackingSource" TEXT,
  "googleLsaLeadId" TEXT,
  "callerNumber" TEXT NOT NULL,
  "dialedNumber" TEXT NOT NULL,
  "customerId" TEXT,
  "revenueAmount" DECIMAL(12, 2),
  "convertedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "CallConversion_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "CallConversion_callLogId_key" ON "CallConversion"("callLogId");
CREATE INDEX IF NOT EXISTS "CallConversion_companyId_booked_convertedAt_idx" ON "CallConversion"("companyId", "booked", "convertedAt");
CREATE INDEX IF NOT EXISTS "CallConversion_companyId_attributionMethod_convertedAt_idx" ON "CallConversion"("companyId", "attributionMethod", "convertedAt");
CREATE INDEX IF NOT EXISTS "CallConversion_companyId_trackingSource_convertedAt_idx" ON "CallConversion"("companyId", "trackingSource", "convertedAt");
CREATE INDEX IF NOT EXISTS "CallConversion_answeredByUserId_convertedAt_idx" ON "CallConversion"("answeredByUserId", "convertedAt");
CREATE INDEX IF NOT EXISTS "CallConversion_visitId_idx" ON "CallConversion"("visitId");
CREATE INDEX IF NOT EXISTS "CallConversion_googleLsaLeadId_idx" ON "CallConversion"("googleLsaLeadId");

CREATE INDEX IF NOT EXISTS "CallLog_companyId_attributionMethod_startedAt_idx" ON "CallLog"("companyId", "attributionMethod", "startedAt");
CREATE INDEX IF NOT EXISTS "CallLog_companyId_fromNumber_startedAt_idx" ON "CallLog"("companyId", "fromNumber", "startedAt");
CREATE INDEX IF NOT EXISTS "CallLog_googleLsaLeadId_idx" ON "CallLog"("googleLsaLeadId");

DO $$ BEGIN
  ALTER TABLE "CallLog" ADD CONSTRAINT "CallLog_phoneNumberId_fkey"
    FOREIGN KEY ("phoneNumberId") REFERENCES "PhoneNumber"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "CallConversion" ADD CONSTRAINT "CallConversion_companyId_fkey"
    FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "CallConversion" ADD CONSTRAINT "CallConversion_callLogId_fkey"
    FOREIGN KEY ("callLogId") REFERENCES "CallLog"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "CallConversion" ADD CONSTRAINT "CallConversion_callSessionId_fkey"
    FOREIGN KEY ("callSessionId") REFERENCES "CallSession"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "CallConversion" ADD CONSTRAINT "CallConversion_answeredByUserId_fkey"
    FOREIGN KEY ("answeredByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "CallConversion" ADD CONSTRAINT "CallConversion_visitId_fkey"
    FOREIGN KEY ("visitId") REFERENCES "ScheduledJob"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "CallConversion" ADD CONSTRAINT "CallConversion_phoneNumberId_fkey"
    FOREIGN KEY ("phoneNumberId") REFERENCES "PhoneNumber"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "CallConversion" ADD CONSTRAINT "CallConversion_customerId_fkey"
    FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
