-- Add optional foreman on crews (schedule Day column avatar).
ALTER TABLE "Crew" ADD COLUMN IF NOT EXISTS "foremanUserId" TEXT;

CREATE INDEX IF NOT EXISTS "Crew_foremanUserId_idx" ON "Crew"("foremanUserId");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'Crew_foremanUserId_fkey'
  ) THEN
    ALTER TABLE "Crew"
      ADD CONSTRAINT "Crew_foremanUserId_fkey"
      FOREIGN KEY ("foremanUserId") REFERENCES "User"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;
