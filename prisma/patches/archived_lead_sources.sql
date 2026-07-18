-- Soft-archive list for lead sources (settings Lead Sources page).
ALTER TABLE "Company" ADD COLUMN IF NOT EXISTS "archivedLeadSources" TEXT[] DEFAULT ARRAY[]::TEXT[];
