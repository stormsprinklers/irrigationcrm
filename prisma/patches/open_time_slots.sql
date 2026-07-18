-- Open Time Slots: schedule Day-view dashed booking windows.
ALTER TABLE "Company" ADD COLUMN IF NOT EXISTS "openTimeSlotsEnabled" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "Company" ADD COLUMN IF NOT EXISTS "divisionBookingWindows" JSONB;
