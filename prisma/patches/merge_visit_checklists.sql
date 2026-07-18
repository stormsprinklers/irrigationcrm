-- Merge applied visit checklists into one UI checklist.
ALTER TABLE "Company" ADD COLUMN IF NOT EXISTS "mergeVisitChecklists" BOOLEAN NOT NULL DEFAULT false;
