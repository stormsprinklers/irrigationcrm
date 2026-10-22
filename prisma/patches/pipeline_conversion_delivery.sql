ALTER TABLE "Company"
  ADD COLUMN IF NOT EXISTS "googleAdsPipelineLeadActionId" TEXT,
  ADD COLUMN IF NOT EXISTS "googleAdsPipelineQualifiedActionId" TEXT,
  ADD COLUMN IF NOT EXISTS "googleAdsPipelineConvertedActionId" TEXT,
  ADD COLUMN IF NOT EXISTS "googleAdsPipelineSoldActionId" TEXT,
  ADD COLUMN IF NOT EXISTS "googleAdsPipelineConfiguredAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "metaConversionsAccessToken" TEXT,
  ADD COLUMN IF NOT EXISTS "metaConversionsDatasetId" TEXT,
  ADD COLUMN IF NOT EXISTS "metaConversionsTestEventCode" TEXT,
  ADD COLUMN IF NOT EXISTS "metaConversionsConfiguredAt" TIMESTAMP(3);

DO $$ BEGIN
  CREATE TYPE "PipelineConversionPlatform" AS ENUM ('GOOGLE', 'META');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE "PipelineConversionDeliveryStatus" AS ENUM ('PENDING', 'PROCESSING', 'SENT', 'FAILED');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS "PipelineConversionEvent" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "companyId" TEXT NOT NULL REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  "customerId" TEXT NOT NULL REFERENCES "Customer"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  "stage" "SalesPipelineStage" NOT NULL,
  "occurredAt" TIMESTAMP(3) NOT NULL,
  "value" DECIMAL(12,2),
  "currency" TEXT NOT NULL DEFAULT 'USD',
  "eventSource" TEXT NOT NULL DEFAULT 'WEB',
  "emailSha256" TEXT,
  "phoneSha256" TEXT,
  "gclid" TEXT,
  "gbraid" TEXT,
  "wbraid" TEXT,
  "fbc" TEXT,
  "fbp" TEXT,
  "userAgent" TEXT,
  "sourceEntityType" TEXT,
  "sourceEntityId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS "PipelineConversionDelivery" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "eventId" TEXT NOT NULL REFERENCES "PipelineConversionEvent"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  "platform" "PipelineConversionPlatform" NOT NULL,
  "status" "PipelineConversionDeliveryStatus" NOT NULL DEFAULT 'PENDING',
  "attempts" INTEGER NOT NULL DEFAULT 0,
  "nextAttemptAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "leaseUntil" TIMESTAMP(3),
  "sentAt" TIMESTAMP(3),
  "providerRequestId" TEXT,
  "lastError" TEXT,
  "responseMetadata" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

ALTER TABLE "PipelineConversionEvent"
  ADD COLUMN IF NOT EXISTS "eventSource" TEXT NOT NULL DEFAULT 'WEB';

CREATE UNIQUE INDEX IF NOT EXISTS "PipelineConversionEvent_companyId_customerId_stage_key"
  ON "PipelineConversionEvent"("companyId", "customerId", "stage");
CREATE INDEX IF NOT EXISTS "PipelineConversionEvent_companyId_occurredAt_idx"
  ON "PipelineConversionEvent"("companyId", "occurredAt");
CREATE INDEX IF NOT EXISTS "PipelineConversionEvent_customerId_occurredAt_idx"
  ON "PipelineConversionEvent"("customerId", "occurredAt");
CREATE UNIQUE INDEX IF NOT EXISTS "PipelineConversionDelivery_eventId_platform_key"
  ON "PipelineConversionDelivery"("eventId", "platform");
CREATE INDEX IF NOT EXISTS "PipelineConversionDelivery_status_nextAttemptAt_idx"
  ON "PipelineConversionDelivery"("status", "nextAttemptAt");
CREATE INDEX IF NOT EXISTS "PipelineConversionDelivery_leaseUntil_idx"
  ON "PipelineConversionDelivery"("leaseUntil");
