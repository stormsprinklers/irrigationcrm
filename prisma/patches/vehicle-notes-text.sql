-- Ensure Vehicle.notes exists (safe to re-run).
ALTER TABLE "Vehicle" ADD COLUMN IF NOT EXISTS "notes" TEXT;
ALTER TABLE "Vehicle" ADD COLUMN IF NOT EXISTS "aiSummary" TEXT;
