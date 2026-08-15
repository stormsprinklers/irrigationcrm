ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "reviewNameAliases" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];

DO $$ BEGIN
  CREATE TYPE "GbpReviewAssignStatus" AS ENUM ('ASSIGNED', 'NEEDS_REVIEW');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS "GbpReview" (
  "id" TEXT NOT NULL,
  "companyId" TEXT NOT NULL,
  "reviewId" TEXT NOT NULL,
  "reviewerName" TEXT NOT NULL,
  "comment" TEXT,
  "starRating" TEXT NOT NULL,
  "createTime" TIMESTAMP(3),
  "status" "GbpReviewAssignStatus" NOT NULL DEFAULT 'NEEDS_REVIEW',
  "customerId" TEXT,
  "assignedManually" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "GbpReview_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "GbpReview_companyId_reviewId_key" ON "GbpReview"("companyId", "reviewId");
CREATE INDEX IF NOT EXISTS "GbpReview_companyId_status_idx" ON "GbpReview"("companyId", "status");
CREATE INDEX IF NOT EXISTS "GbpReview_companyId_createTime_idx" ON "GbpReview"("companyId", "createTime");

CREATE TABLE IF NOT EXISTS "GbpReviewAssignment" (
  "id" TEXT NOT NULL,
  "reviewId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "share" DECIMAL(8,4) NOT NULL,
  CONSTRAINT "GbpReviewAssignment_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "GbpReviewAssignment_reviewId_userId_key" ON "GbpReviewAssignment"("reviewId", "userId");
CREATE INDEX IF NOT EXISTS "GbpReviewAssignment_userId_idx" ON "GbpReviewAssignment"("userId");

DO $$ BEGIN
  ALTER TABLE "GbpReview" ADD CONSTRAINT "GbpReview_companyId_fkey"
    FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "GbpReview" ADD CONSTRAINT "GbpReview_customerId_fkey"
    FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "GbpReviewAssignment" ADD CONSTRAINT "GbpReviewAssignment_reviewId_fkey"
    FOREIGN KEY ("reviewId") REFERENCES "GbpReview"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "GbpReviewAssignment" ADD CONSTRAINT "GbpReviewAssignment_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
