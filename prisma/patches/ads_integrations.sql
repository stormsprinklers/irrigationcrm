-- Google Ads + Meta Ads account linking (Company)
ALTER TABLE "Company" ADD COLUMN IF NOT EXISTS "googleAdsRefreshToken" TEXT;
ALTER TABLE "Company" ADD COLUMN IF NOT EXISTS "googleAdsCustomerId" TEXT;
ALTER TABLE "Company" ADD COLUMN IF NOT EXISTS "googleAdsCustomerName" TEXT;
ALTER TABLE "Company" ADD COLUMN IF NOT EXISTS "googleAdsLoginCustomerId" TEXT;
ALTER TABLE "Company" ADD COLUMN IF NOT EXISTS "googleAdsConnectedAt" TIMESTAMP(3);
ALTER TABLE "Company" ADD COLUMN IF NOT EXISTS "metaAdsAccessToken" TEXT;
ALTER TABLE "Company" ADD COLUMN IF NOT EXISTS "metaAdAccountId" TEXT;
ALTER TABLE "Company" ADD COLUMN IF NOT EXISTS "metaAdAccountName" TEXT;
ALTER TABLE "Company" ADD COLUMN IF NOT EXISTS "metaAdsConnectedAt" TIMESTAMP(3);
