DO $$
BEGIN
  ALTER TYPE "UserRole" ADD VALUE IF NOT EXISTS 'AFFILIATE';
  ALTER TYPE "IntegrationType" ADD VALUE IF NOT EXISTS 'AFFILIATE';
END $$;

ALTER TABLE "IntegrationCredential"
  ADD COLUMN IF NOT EXISTS "ownerUserId" TEXT;

ALTER TABLE "Customer"
  ADD COLUMN IF NOT EXISTS "affiliateUserId" TEXT;

CREATE TABLE IF NOT EXISTS "AffiliateSignInToken" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "tokenHash" TEXT NOT NULL,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "usedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AffiliateSignInToken_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "AffiliateSignInToken_tokenHash_key"
  ON "AffiliateSignInToken"("tokenHash");

CREATE INDEX IF NOT EXISTS "AffiliateSignInToken_userId_idx"
  ON "AffiliateSignInToken"("userId");

CREATE INDEX IF NOT EXISTS "AffiliateSignInToken_expiresAt_idx"
  ON "AffiliateSignInToken"("expiresAt");

CREATE INDEX IF NOT EXISTS "IntegrationCredential_ownerUserId_type_idx"
  ON "IntegrationCredential"("ownerUserId", "type");

CREATE INDEX IF NOT EXISTS "Customer_companyId_affiliateUserId_idx"
  ON "Customer"("companyId", "affiliateUserId");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'IntegrationCredential_ownerUserId_fkey'
  ) THEN
    ALTER TABLE "IntegrationCredential"
      ADD CONSTRAINT "IntegrationCredential_ownerUserId_fkey"
      FOREIGN KEY ("ownerUserId") REFERENCES "User"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'Customer_affiliateUserId_fkey'
  ) THEN
    ALTER TABLE "Customer"
      ADD CONSTRAINT "Customer_affiliateUserId_fkey"
      FOREIGN KEY ("affiliateUserId") REFERENCES "User"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'AffiliateSignInToken_userId_fkey'
  ) THEN
    ALTER TABLE "AffiliateSignInToken"
      ADD CONSTRAINT "AffiliateSignInToken_userId_fkey"
      FOREIGN KEY ("userId") REFERENCES "User"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;
