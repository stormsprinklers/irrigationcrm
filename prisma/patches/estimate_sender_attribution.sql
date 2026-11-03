ALTER TABLE "Estimate"
  ADD COLUMN IF NOT EXISTS "sentById" TEXT,
  ADD COLUMN IF NOT EXISTS "sentByAt" TIMESTAMP(3);

CREATE INDEX IF NOT EXISTS "Estimate_companyId_sentById_sentByAt_idx"
  ON "Estimate"("companyId", "sentById", "sentByAt");

DO $$ BEGIN
  ALTER TABLE "Estimate"
    ADD CONSTRAINT "Estimate_sentById_fkey"
    FOREIGN KEY ("sentById") REFERENCES "User"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
