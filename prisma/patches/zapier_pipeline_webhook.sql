ALTER TABLE "Company"
  ADD COLUMN IF NOT EXISTS "zapierPipelineWebhookUrl" TEXT;

ALTER TYPE "PipelineConversionPlatform"
  ADD VALUE IF NOT EXISTS 'ZAPIER';
