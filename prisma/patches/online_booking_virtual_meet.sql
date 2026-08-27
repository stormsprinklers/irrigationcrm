-- Virtual online booking, bookable staff, and company Google Calendar for Meet.
ALTER TABLE "Company" ADD COLUMN IF NOT EXISTS "onlineBookingVirtualOnly" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Company" ADD COLUMN IF NOT EXISTS "googleCalendarRefreshToken" TEXT;
ALTER TABLE "Company" ADD COLUMN IF NOT EXISTS "googleCalendarConnectedEmail" TEXT;
ALTER TABLE "Company" ADD COLUMN IF NOT EXISTS "googleCalendarConnectedAt" TIMESTAMP(3);

ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "onlineBookingEnabled" BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE "ScheduledJob" ADD COLUMN IF NOT EXISTS "meetingUrl" TEXT;
