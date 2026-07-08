-- Store the satellite capture center/zoom so the aerial can be cropped/zoomed and
-- existing zone polygons remapped to the new image.
ALTER TABLE "CustomerProperty" ADD COLUMN IF NOT EXISTS "aerialCenterLat" DOUBLE PRECISION;
ALTER TABLE "CustomerProperty" ADD COLUMN IF NOT EXISTS "aerialCenterLng" DOUBLE PRECISION;
ALTER TABLE "CustomerProperty" ADD COLUMN IF NOT EXISTS "aerialZoom" INTEGER;
