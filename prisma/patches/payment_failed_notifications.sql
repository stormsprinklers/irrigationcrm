-- Customer payment-failed toggle + admin PAYMENT_FAILED in-app type
ALTER TABLE "Company" ADD COLUMN IF NOT EXISTS "notifyInvoicePaymentFailed" BOOLEAN NOT NULL DEFAULT true;

DO $$ BEGIN
  ALTER TYPE "AppNotificationType" ADD VALUE IF NOT EXISTS 'PAYMENT_FAILED';
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;
