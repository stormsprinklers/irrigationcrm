-- Hiring / careers applicants + phone-screen booking.
-- Run against the CRM Postgres database before/at deploy.

DO $$ BEGIN
  CREATE TYPE "ApplicantStage" AS ENUM ('REJECTED', 'MAYBE', 'GOOD_FIT');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "ApplicantStageSource" AS ENUM ('AI', 'MANUAL');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "HiringScreenBookingStatus" AS ENUM ('SCHEDULED', 'CANCELLED', 'COMPLETED');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

ALTER TYPE "AppNotificationType" ADD VALUE IF NOT EXISTS 'HIRING_APPLICANT';
ALTER TYPE "AppNotificationType" ADD VALUE IF NOT EXISTS 'HIRING_SCREEN_BOOKED';

CREATE TABLE IF NOT EXISTS "job_applicants" (
  "id" TEXT NOT NULL,
  "companyId" TEXT NOT NULL,
  "externalId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "email" TEXT NOT NULL,
  "phone" TEXT,
  "jobSlug" TEXT NOT NULL,
  "jobTitle" TEXT,
  "interest" TEXT,
  "hardWorkMeaning" TEXT NOT NULL,
  "integrityMeaning" TEXT NOT NULL,
  "inconvenientServiceExample" TEXT NOT NULL,
  "personalGoals" TEXT NOT NULL,
  "aiScore" INTEGER,
  "stage" "ApplicantStage" NOT NULL DEFAULT 'MAYBE',
  "stageSource" "ApplicantStageSource" NOT NULL DEFAULT 'AI',
  "bookingToken" TEXT,
  "bookingInviteSentAt" TIMESTAMP(3),
  "metadata" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "job_applicants_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "job_applicants_bookingToken_key" ON "job_applicants"("bookingToken");
CREATE UNIQUE INDEX IF NOT EXISTS "job_applicants_companyId_externalId_key" ON "job_applicants"("companyId", "externalId");
CREATE INDEX IF NOT EXISTS "job_applicants_companyId_jobSlug_idx" ON "job_applicants"("companyId", "jobSlug");
CREATE INDEX IF NOT EXISTS "job_applicants_companyId_stage_idx" ON "job_applicants"("companyId", "stage");
CREATE INDEX IF NOT EXISTS "job_applicants_companyId_aiScore_idx" ON "job_applicants"("companyId", "aiScore");
CREATE INDEX IF NOT EXISTS "job_applicants_companyId_createdAt_idx" ON "job_applicants"("companyId", "createdAt");

DO $$ BEGIN
  ALTER TABLE "job_applicants"
    ADD CONSTRAINT "job_applicants_companyId_fkey"
    FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS "hiring_role_assignments" (
  "id" TEXT NOT NULL,
  "companyId" TEXT NOT NULL,
  "jobSlug" TEXT NOT NULL,
  "jobTitle" TEXT,
  "hiringManagerUserId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "hiring_role_assignments_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "hiring_role_assignments_companyId_jobSlug_key"
  ON "hiring_role_assignments"("companyId", "jobSlug");
CREATE INDEX IF NOT EXISTS "hiring_role_assignments_companyId_idx" ON "hiring_role_assignments"("companyId");
CREATE INDEX IF NOT EXISTS "hiring_role_assignments_hiringManagerUserId_idx"
  ON "hiring_role_assignments"("hiringManagerUserId");

DO $$ BEGIN
  ALTER TABLE "hiring_role_assignments"
    ADD CONSTRAINT "hiring_role_assignments_companyId_fkey"
    FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "hiring_role_assignments"
    ADD CONSTRAINT "hiring_role_assignments_hiringManagerUserId_fkey"
    FOREIGN KEY ("hiringManagerUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS "hiring_manager_availabilities" (
  "id" TEXT NOT NULL,
  "companyId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "weeklyHours" JSONB,
  "blockedSlots" JSONB,
  "leadTimeHours" INTEGER NOT NULL DEFAULT 2,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "hiring_manager_availabilities_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "hiring_manager_availabilities_userId_key"
  ON "hiring_manager_availabilities"("userId");
CREATE INDEX IF NOT EXISTS "hiring_manager_availabilities_companyId_idx"
  ON "hiring_manager_availabilities"("companyId");

DO $$ BEGIN
  ALTER TABLE "hiring_manager_availabilities"
    ADD CONSTRAINT "hiring_manager_availabilities_companyId_fkey"
    FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "hiring_manager_availabilities"
    ADD CONSTRAINT "hiring_manager_availabilities_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS "hiring_screen_bookings" (
  "id" TEXT NOT NULL,
  "companyId" TEXT NOT NULL,
  "applicantId" TEXT NOT NULL,
  "managerUserId" TEXT NOT NULL,
  "startAt" TIMESTAMP(3) NOT NULL,
  "endAt" TIMESTAMP(3) NOT NULL,
  "status" "HiringScreenBookingStatus" NOT NULL DEFAULT 'SCHEDULED',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "hiring_screen_bookings_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "hiring_screen_bookings_companyId_startAt_idx"
  ON "hiring_screen_bookings"("companyId", "startAt");
CREATE INDEX IF NOT EXISTS "hiring_screen_bookings_managerUserId_startAt_idx"
  ON "hiring_screen_bookings"("managerUserId", "startAt");
CREATE INDEX IF NOT EXISTS "hiring_screen_bookings_applicantId_idx"
  ON "hiring_screen_bookings"("applicantId");

DO $$ BEGIN
  ALTER TABLE "hiring_screen_bookings"
    ADD CONSTRAINT "hiring_screen_bookings_companyId_fkey"
    FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "hiring_screen_bookings"
    ADD CONSTRAINT "hiring_screen_bookings_applicantId_fkey"
    FOREIGN KEY ("applicantId") REFERENCES "job_applicants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "hiring_screen_bookings"
    ADD CONSTRAINT "hiring_screen_bookings_managerUserId_fkey"
    FOREIGN KEY ("managerUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
