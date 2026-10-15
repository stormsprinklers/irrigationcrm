-- Idempotent security hardening rollout for existing PostgreSQL deployments.
-- This file is intentionally additive and contains no destructive DDL.

CREATE TABLE IF NOT EXISTS "OAuthStateNonce" (
  "id" TEXT PRIMARY KEY,
  "nonceHash" TEXT NOT NULL UNIQUE,
  "companyId" TEXT NOT NULL,
  "provider" TEXT NOT NULL,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "consumedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS "OAuthStateNonce_companyId_provider_idx" ON "OAuthStateNonce"("companyId", "provider");
CREATE INDEX IF NOT EXISTS "OAuthStateNonce_expiresAt_idx" ON "OAuthStateNonce"("expiresAt");

CREATE TABLE IF NOT EXISTS "WebhookEventReceipt" (
  "key" TEXT PRIMARY KEY,
  "provider" TEXT NOT NULL,
  "eventId" TEXT NOT NULL,
  "status" TEXT NOT NULL,
  "attempts" INTEGER NOT NULL DEFAULT 1,
  "leaseUntil" TIMESTAMP(3),
  "processedAt" TIMESTAMP(3),
  "lastError" TEXT,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS "WebhookEventReceipt_provider_eventId_idx" ON "WebhookEventReceipt"("provider", "eventId");
CREATE INDEX IF NOT EXISTS "WebhookEventReceipt_expiresAt_idx" ON "WebhookEventReceipt"("expiresAt");

CREATE TABLE IF NOT EXISTS "SecurityAuditEvent" (
  "id" TEXT PRIMARY KEY,
  "companyId" TEXT,
  "actorId" TEXT,
  "event" TEXT NOT NULL,
  "outcome" TEXT NOT NULL,
  "audience" TEXT,
  "subjectHash" TEXT,
  "ipHash" TEXT,
  "resourceType" TEXT,
  "resourceId" TEXT,
  "metadata" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS "SecurityAuditEvent_companyId_createdAt_idx" ON "SecurityAuditEvent"("companyId", "createdAt");
CREATE INDEX IF NOT EXISTS "SecurityAuditEvent_event_createdAt_idx" ON "SecurityAuditEvent"("event", "createdAt");
CREATE INDEX IF NOT EXISTS "SecurityAuditEvent_subjectHash_createdAt_idx" ON "SecurityAuditEvent"("subjectHash", "createdAt");
CREATE INDEX IF NOT EXISTS "SecurityAuditEvent_createdAt_idx" ON "SecurityAuditEvent"("createdAt");

ALTER TABLE "Estimate" ADD COLUMN IF NOT EXISTS "publicTokenExpiresAt" TIMESTAMP(3);
UPDATE "Estimate" SET "publicTokenExpiresAt" = CURRENT_TIMESTAMP + INTERVAL '180 days' WHERE "publicTokenExpiresAt" IS NULL;
ALTER TABLE "Estimate" ALTER COLUMN "publicTokenExpiresAt" SET DEFAULT (CURRENT_TIMESTAMP + INTERVAL '180 days');
ALTER TABLE "Estimate" ALTER COLUMN "publicTokenExpiresAt" SET NOT NULL;
ALTER TABLE "Estimate" ADD COLUMN IF NOT EXISTS "publicTokenRevokedAt" TIMESTAMP(3);
ALTER TABLE "Estimate" ADD COLUMN IF NOT EXISTS "publicTokenVersion" INTEGER NOT NULL DEFAULT 1;

ALTER TABLE "Invoice" ADD COLUMN IF NOT EXISTS "publicTokenExpiresAt" TIMESTAMP(3);
UPDATE "Invoice" SET "publicTokenExpiresAt" = CURRENT_TIMESTAMP + INTERVAL '180 days' WHERE "publicTokenExpiresAt" IS NULL;
ALTER TABLE "Invoice" ALTER COLUMN "publicTokenExpiresAt" SET DEFAULT (CURRENT_TIMESTAMP + INTERVAL '180 days');
ALTER TABLE "Invoice" ALTER COLUMN "publicTokenExpiresAt" SET NOT NULL;
ALTER TABLE "Invoice" ADD COLUMN IF NOT EXISTS "publicTokenRevokedAt" TIMESTAMP(3);
ALTER TABLE "Invoice" ADD COLUMN IF NOT EXISTS "publicTokenVersion" INTEGER NOT NULL DEFAULT 1;
