-- Staff-only option notes used as AI context (not customer-facing).
ALTER TABLE "EstimateOption" ADD COLUMN IF NOT EXISTS "internalNotes" TEXT;
