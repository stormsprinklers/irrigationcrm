ALTER TYPE "UserRole" ADD VALUE IF NOT EXISTS 'BULB_PREP';

ALTER TABLE "ScheduledJob"
  ADD COLUMN IF NOT EXISTS "bulbPrepCompletedAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "bulbPrepCompletedById" TEXT;

CREATE INDEX IF NOT EXISTS "ScheduledJob_bulbPrepCompletedById_idx"
  ON "ScheduledJob"("bulbPrepCompletedById");

DO $$
BEGIN
  ALTER TABLE "ScheduledJob"
    ADD CONSTRAINT "ScheduledJob_bulbPrepCompletedById_fkey"
    FOREIGN KEY ("bulbPrepCompletedById") REFERENCES "User"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
