-- Private, admin-owned voice/SMS assistant.
DO $$ BEGIN
  ALTER TYPE "AuthMfaPurpose" ADD VALUE IF NOT EXISTS 'OWNER_ASSISTANT_SETTINGS';
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS "OwnerAssistantConfig" (
  "id" TEXT NOT NULL,
  "ownerUserId" TEXT NOT NULL,
  "homeCompanyId" TEXT NOT NULL,
  "phoneNumberId" TEXT,
  "enabled" BOOLEAN NOT NULL DEFAULT false,
  "name" TEXT NOT NULL DEFAULT 'Owner Assistant',
  "authorizedPhoneE164" TEXT,
  "pinHash" TEXT,
  "voice" TEXT NOT NULL DEFAULT 'alloy',
  "availabilityJson" JSONB NOT NULL DEFAULT '{"mode":"ALWAYS"}',
  "maxCallMinutes" INTEGER NOT NULL DEFAULT 15,
  "allOperatedCompanies" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "OwnerAssistantConfig_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "OwnerAssistantSession" (
  "id" TEXT NOT NULL,
  "configId" TEXT NOT NULL,
  "companyId" TEXT NOT NULL,
  "providerSid" TEXT NOT NULL,
  "channel" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'CONNECTING',
  "fromE164" TEXT NOT NULL,
  "toE164" TEXT NOT NULL,
  "pinVerifiedAt" TIMESTAMP(3),
  "failedPinAttempts" INTEGER NOT NULL DEFAULT 0,
  "activeCompanyId" TEXT,
  "transcript" TEXT NOT NULL DEFAULT '',
  "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "endedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "OwnerAssistantSession_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "OwnerAssistantMessage" (
  "id" TEXT NOT NULL,
  "configId" TEXT NOT NULL,
  "providerSid" TEXT,
  "role" TEXT NOT NULL,
  "channel" TEXT NOT NULL,
  "content" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "OwnerAssistantMessage_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "OwnerAssistantToolInvocation" (
  "id" TEXT NOT NULL,
  "configId" TEXT NOT NULL,
  "sessionId" TEXT,
  "companyId" TEXT,
  "tool" TEXT NOT NULL,
  "argsHash" TEXT NOT NULL,
  "resultCode" TEXT NOT NULL,
  "latencyMs" INTEGER NOT NULL DEFAULT 0,
  "errorMessage" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "OwnerAssistantToolInvocation_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "OwnerAssistantConfig_ownerUserId_key" ON "OwnerAssistantConfig"("ownerUserId");
CREATE UNIQUE INDEX IF NOT EXISTS "OwnerAssistantConfig_phoneNumberId_key" ON "OwnerAssistantConfig"("phoneNumberId");
CREATE INDEX IF NOT EXISTS "OwnerAssistantConfig_homeCompanyId_idx" ON "OwnerAssistantConfig"("homeCompanyId");
CREATE INDEX IF NOT EXISTS "OwnerAssistantConfig_authorizedPhoneE164_idx" ON "OwnerAssistantConfig"("authorizedPhoneE164");
CREATE UNIQUE INDEX IF NOT EXISTS "OwnerAssistantSession_providerSid_key" ON "OwnerAssistantSession"("providerSid");
CREATE INDEX IF NOT EXISTS "OwnerAssistantSession_configId_createdAt_idx" ON "OwnerAssistantSession"("configId", "createdAt");
CREATE INDEX IF NOT EXISTS "OwnerAssistantSession_companyId_status_idx" ON "OwnerAssistantSession"("companyId", "status");
CREATE UNIQUE INDEX IF NOT EXISTS "OwnerAssistantMessage_providerSid_key" ON "OwnerAssistantMessage"("providerSid");
CREATE INDEX IF NOT EXISTS "OwnerAssistantMessage_configId_createdAt_idx" ON "OwnerAssistantMessage"("configId", "createdAt");
CREATE INDEX IF NOT EXISTS "OwnerAssistantToolInvocation_configId_createdAt_idx" ON "OwnerAssistantToolInvocation"("configId", "createdAt");
CREATE INDEX IF NOT EXISTS "OwnerAssistantToolInvocation_sessionId_createdAt_idx" ON "OwnerAssistantToolInvocation"("sessionId", "createdAt");
CREATE INDEX IF NOT EXISTS "OwnerAssistantToolInvocation_companyId_tool_idx" ON "OwnerAssistantToolInvocation"("companyId", "tool");

DO $$ BEGIN
  ALTER TABLE "OwnerAssistantConfig" ADD CONSTRAINT "OwnerAssistantConfig_ownerUserId_fkey" FOREIGN KEY ("ownerUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE "OwnerAssistantConfig" ADD CONSTRAINT "OwnerAssistantConfig_homeCompanyId_fkey" FOREIGN KEY ("homeCompanyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE "OwnerAssistantConfig" ADD CONSTRAINT "OwnerAssistantConfig_phoneNumberId_fkey" FOREIGN KEY ("phoneNumberId") REFERENCES "PhoneNumber"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE "OwnerAssistantSession" ADD CONSTRAINT "OwnerAssistantSession_configId_fkey" FOREIGN KEY ("configId") REFERENCES "OwnerAssistantConfig"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE "OwnerAssistantSession" ADD CONSTRAINT "OwnerAssistantSession_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE "OwnerAssistantMessage" ADD CONSTRAINT "OwnerAssistantMessage_configId_fkey" FOREIGN KEY ("configId") REFERENCES "OwnerAssistantConfig"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE "OwnerAssistantToolInvocation" ADD CONSTRAINT "OwnerAssistantToolInvocation_configId_fkey" FOREIGN KEY ("configId") REFERENCES "OwnerAssistantConfig"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE "OwnerAssistantToolInvocation" ADD CONSTRAINT "OwnerAssistantToolInvocation_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "OwnerAssistantSession"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE "OwnerAssistantToolInvocation" ADD CONSTRAINT "OwnerAssistantToolInvocation_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
