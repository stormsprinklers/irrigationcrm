-- Marketing campaigns overhaul: opt-out + automation flow nodes
ALTER TABLE "Customer" ADD COLUMN IF NOT EXISTS "marketingEmailOptOut" BOOLEAN NOT NULL DEFAULT false;

DO $$ BEGIN
  CREATE TYPE "CampaignFlowNodeType" AS ENUM ('TRIGGER', 'WAIT', 'SEND_EMAIL', 'SEND_SMS', 'BRANCH', 'EXIT');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

CREATE TABLE IF NOT EXISTS "CampaignFlowNode" (
  "id" TEXT NOT NULL,
  "campaignId" TEXT NOT NULL,
  "type" "CampaignFlowNodeType" NOT NULL,
  "config" JSONB NOT NULL DEFAULT '{}',
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "CampaignFlowNode_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "CampaignFlowNode_campaignId_sortOrder_idx" ON "CampaignFlowNode"("campaignId", "sortOrder");

DO $$ BEGIN
  ALTER TABLE "CampaignFlowNode"
    ADD CONSTRAINT "CampaignFlowNode_campaignId_fkey"
    FOREIGN KEY ("campaignId") REFERENCES "Campaign"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

ALTER TABLE "CampaignEnrollment" ADD COLUMN IF NOT EXISTS "currentNodeId" TEXT;
CREATE INDEX IF NOT EXISTS "CampaignEnrollment_currentNodeId_idx" ON "CampaignEnrollment"("currentNodeId");

CREATE TABLE IF NOT EXISTS "CampaignEnrollmentEvent" (
  "id" TEXT NOT NULL,
  "enrollmentId" TEXT NOT NULL,
  "nodeId" TEXT,
  "eventType" TEXT NOT NULL,
  "meta" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "CampaignEnrollmentEvent_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "CampaignEnrollmentEvent_enrollmentId_createdAt_idx"
  ON "CampaignEnrollmentEvent"("enrollmentId", "createdAt");
CREATE INDEX IF NOT EXISTS "CampaignEnrollmentEvent_nodeId_idx"
  ON "CampaignEnrollmentEvent"("nodeId");

DO $$ BEGIN
  ALTER TABLE "CampaignEnrollmentEvent"
    ADD CONSTRAINT "CampaignEnrollmentEvent_enrollmentId_fkey"
    FOREIGN KEY ("enrollmentId") REFERENCES "CampaignEnrollment"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;
