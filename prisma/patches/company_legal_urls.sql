-- Company Terms of Service + Privacy Policy URLs for mobile, receipts, and portal.
ALTER TABLE "Company" ADD COLUMN IF NOT EXISTS "termsOfServiceUrl" TEXT;
ALTER TABLE "Company" ADD COLUMN IF NOT EXISTS "privacyPolicyUrl" TEXT;
