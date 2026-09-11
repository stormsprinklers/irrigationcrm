-- Marketing-site booking URLs (Housecall Pro / website booker) plus Radar on-site slot length.
-- These are not connected to Housecall Pro or the website booking APIs.
ALTER TABLE "Company" ADD COLUMN IF NOT EXISTS "onlineBookingSlotMinutes" INTEGER NOT NULL DEFAULT 120;
ALTER TABLE "Company" ADD COLUMN IF NOT EXISTS "websiteBookingUrl" TEXT;
ALTER TABLE "Company" ADD COLUMN IF NOT EXISTS "websiteWinterizationBookingUrl" TEXT;
