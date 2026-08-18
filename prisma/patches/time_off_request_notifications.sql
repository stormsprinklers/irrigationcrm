-- AppNotificationType: TIME_OFF_REQUEST (Prisma enum)
DO $$ BEGIN
  ALTER TYPE "AppNotificationType" ADD VALUE IF NOT EXISTS 'TIME_OFF_REQUEST';
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;
