-- First-touch attribution + daily spend snapshots.
-- Run against the CRM Postgres database before/at deploy.

DO $$ BEGIN
  CREATE TYPE "AttributionFirstTouchMethod" AS ENUM (
    'FORM', 'CALL', 'SMS', 'TEL_CLICK', 'SMS_CLICK', 'BOOKING', 'LSA', 'MANUAL'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "MarketingSpendChannel" AS ENUM ('google_ads', 'google_lsa', 'meta_ads');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE "Customer"
  ADD COLUMN IF NOT EXISTS "attributionChannel" TEXT,
  ADD COLUMN IF NOT EXISTS "attributionSource" TEXT,
  ADD COLUMN IF NOT EXISTS "attributionMedium" TEXT,
  ADD COLUMN IF NOT EXISTS "attributionCampaign" TEXT,
  ADD COLUMN IF NOT EXISTS "attributionTerm" TEXT,
  ADD COLUMN IF NOT EXISTS "attributionContent" TEXT,
  ADD COLUMN IF NOT EXISTS "gclid" TEXT,
  ADD COLUMN IF NOT EXISTS "fbclid" TEXT,
  ADD COLUMN IF NOT EXISTS "msclkid" TEXT,
  ADD COLUMN IF NOT EXISTS "firstTouchAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "firstTouchMethod" "AttributionFirstTouchMethod";

ALTER TABLE "Lead"
  ADD COLUMN IF NOT EXISTS "attributionChannel" TEXT,
  ADD COLUMN IF NOT EXISTS "attributionSource" TEXT,
  ADD COLUMN IF NOT EXISTS "attributionMedium" TEXT,
  ADD COLUMN IF NOT EXISTS "attributionCampaign" TEXT,
  ADD COLUMN IF NOT EXISTS "attributionTerm" TEXT,
  ADD COLUMN IF NOT EXISTS "attributionContent" TEXT,
  ADD COLUMN IF NOT EXISTS "gclid" TEXT,
  ADD COLUMN IF NOT EXISTS "fbclid" TEXT,
  ADD COLUMN IF NOT EXISTS "msclkid" TEXT,
  ADD COLUMN IF NOT EXISTS "firstTouchAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "firstTouchMethod" "AttributionFirstTouchMethod";

CREATE INDEX IF NOT EXISTS "Customer_companyId_attributionChannel_idx"
  ON "Customer"("companyId", "attributionChannel");
CREATE INDEX IF NOT EXISTS "Customer_companyId_createdAt_idx"
  ON "Customer"("companyId", "createdAt");
CREATE INDEX IF NOT EXISTS "Lead_companyId_attributionChannel_idx"
  ON "Lead"("companyId", "attributionChannel");

CREATE TABLE IF NOT EXISTS "marketing_touch_events" (
  "id" TEXT NOT NULL,
  "companyId" TEXT NOT NULL,
  "customerId" TEXT,
  "leadId" TEXT,
  "callLogId" TEXT,
  "conversationId" TEXT,
  "sessionId" TEXT,
  "eventType" TEXT NOT NULL,
  "channel" TEXT NOT NULL,
  "source" TEXT,
  "medium" TEXT,
  "campaign" TEXT,
  "term" TEXT,
  "content" TEXT,
  "gclid" TEXT,
  "fbclid" TEXT,
  "msclkid" TEXT,
  "trackingSource" TEXT,
  "phone" TEXT,
  "pagePath" TEXT,
  "occurredAt" TIMESTAMP(3) NOT NULL,
  "metadata" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "marketing_touch_events_pkey" PRIMARY KEY ("id")
);

DO $$ BEGIN
  ALTER TABLE "marketing_touch_events"
    ADD CONSTRAINT "marketing_touch_events_companyId_fkey"
    FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "marketing_touch_events"
    ADD CONSTRAINT "marketing_touch_events_customerId_fkey"
    FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "marketing_touch_events"
    ADD CONSTRAINT "marketing_touch_events_leadId_fkey"
    FOREIGN KEY ("leadId") REFERENCES "Lead"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE INDEX IF NOT EXISTS "marketing_touch_events_companyId_occurredAt_idx"
  ON "marketing_touch_events"("companyId", "occurredAt");
CREATE INDEX IF NOT EXISTS "marketing_touch_events_companyId_channel_idx"
  ON "marketing_touch_events"("companyId", "channel");
CREATE INDEX IF NOT EXISTS "marketing_touch_events_companyId_sessionId_idx"
  ON "marketing_touch_events"("companyId", "sessionId");
CREATE INDEX IF NOT EXISTS "marketing_touch_events_customerId_occurredAt_idx"
  ON "marketing_touch_events"("customerId", "occurredAt");
CREATE INDEX IF NOT EXISTS "marketing_touch_events_leadId_occurredAt_idx"
  ON "marketing_touch_events"("leadId", "occurredAt");
CREATE INDEX IF NOT EXISTS "marketing_touch_events_companyId_phone_idx"
  ON "marketing_touch_events"("companyId", "phone");

CREATE TABLE IF NOT EXISTS "marketing_spend_daily" (
  "id" TEXT NOT NULL,
  "companyId" TEXT NOT NULL,
  "date" DATE NOT NULL,
  "channel" "MarketingSpendChannel" NOT NULL,
  "spend" DECIMAL(12,2) NOT NULL,
  "impressions" INTEGER,
  "clicks" INTEGER,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "marketing_spend_daily_pkey" PRIMARY KEY ("id")
);

DO $$ BEGIN
  ALTER TABLE "marketing_spend_daily"
    ADD CONSTRAINT "marketing_spend_daily_companyId_fkey"
    FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS "marketing_spend_daily_companyId_date_channel_key"
  ON "marketing_spend_daily"("companyId", "date", "channel");
CREATE INDEX IF NOT EXISTS "marketing_spend_daily_companyId_date_idx"
  ON "marketing_spend_daily"("companyId", "date");
