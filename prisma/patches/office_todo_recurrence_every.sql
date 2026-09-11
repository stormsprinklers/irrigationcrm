-- Custom CSR to-do recurrence: every N days, weekly on a weekday, or a day of the month.
ALTER TYPE "OfficeTodoRecurrence" ADD VALUE IF NOT EXISTS 'EVERY_N_DAYS';
ALTER TYPE "OfficeTodoRecurrence" ADD VALUE IF NOT EXISTS 'WEEKLY_ON_DAY';
ALTER TYPE "OfficeTodoRecurrence" ADD VALUE IF NOT EXISTS 'MONTHLY_ON_DAY';

ALTER TABLE "OfficeTodo" ADD COLUMN IF NOT EXISTS "recurrenceEvery" INTEGER;
