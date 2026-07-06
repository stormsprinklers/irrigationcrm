-- Mobile push device tokens for Storm CRM iOS (APNs)
CREATE TABLE IF NOT EXISTS "MobilePushDevice" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "companyId" TEXT NOT NULL,
  "platform" TEXT NOT NULL DEFAULT 'ios',
  "deviceToken" TEXT NOT NULL,
  "bundleId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "MobilePushDevice_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "MobilePushDevice_deviceToken_key" ON "MobilePushDevice"("deviceToken");
CREATE INDEX IF NOT EXISTS "MobilePushDevice_userId_idx" ON "MobilePushDevice"("userId");
CREATE INDEX IF NOT EXISTS "MobilePushDevice_companyId_idx" ON "MobilePushDevice"("companyId");

ALTER TABLE "MobilePushDevice"
  ADD CONSTRAINT "MobilePushDevice_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "MobilePushDevice"
  ADD CONSTRAINT "MobilePushDevice_companyId_fkey"
  FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
