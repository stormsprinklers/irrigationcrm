-- Staff push / in-app delivery tracking for new Google reviews
CREATE TABLE IF NOT EXISTS "GbpReviewStaffNotify" (
  "id" TEXT NOT NULL,
  "companyId" TEXT NOT NULL,
  "reviewId" TEXT NOT NULL,
  "notifiedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "GbpReviewStaffNotify_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "GbpReviewStaffNotify_companyId_reviewId_key"
  ON "GbpReviewStaffNotify"("companyId", "reviewId");
CREATE INDEX IF NOT EXISTS "GbpReviewStaffNotify_companyId_notifiedAt_idx"
  ON "GbpReviewStaffNotify"("companyId", "notifiedAt");

DO $$ BEGIN
  ALTER TABLE "GbpReviewStaffNotify"
    ADD CONSTRAINT "GbpReviewStaffNotify_companyId_fkey"
    FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- AppNotificationType: GOOGLE_REVIEW (Prisma enum)
DO $$ BEGIN
  ALTER TYPE "AppNotificationType" ADD VALUE IF NOT EXISTS 'GOOGLE_REVIEW';
EXCEPTION
  WHEN duplicate_object THEN NULL;
  WHEN undefined_object THEN NULL;
END $$;
