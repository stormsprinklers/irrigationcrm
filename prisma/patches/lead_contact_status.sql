-- Lead categorization + speed-to-lead timestamp.
-- Run against the CRM Postgres database before/at deploy.

ALTER TYPE "LeadStatus" ADD VALUE IF NOT EXISTS 'SPAM';

ALTER TABLE "leads"
  ADD COLUMN IF NOT EXISTS "contactedAt" TIMESTAMP(3);

CREATE INDEX IF NOT EXISTS "leads_companyId_contactedAt_idx"
  ON "leads"("companyId", "contactedAt");
