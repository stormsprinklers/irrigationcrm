-- Per-message campaign stats: which flow node and channel produced each send.
ALTER TABLE "CampaignRecipient" ADD COLUMN IF NOT EXISTS "flowNodeId" TEXT;
ALTER TABLE "CampaignRecipient" ADD COLUMN IF NOT EXISTS "channel" "CampaignChannel";
CREATE INDEX IF NOT EXISTS "CampaignRecipient_campaignId_customerId_idx"
  ON "CampaignRecipient"("campaignId", "customerId");
CREATE INDEX IF NOT EXISTS "CampaignRecipient_flowNodeId_idx"
  ON "CampaignRecipient"("flowNodeId");
