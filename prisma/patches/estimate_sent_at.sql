-- Timestamp of the most recent customer send (email/SMS).
ALTER TABLE "Estimate" ADD COLUMN IF NOT EXISTS "sentAt" TIMESTAMP(3);
