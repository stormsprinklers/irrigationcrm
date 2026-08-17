import { getAppBaseUrl } from "@/lib/app-url";
import { absolutePublicBlobUrl, isBlobStorageUrl } from "@/lib/blob/urls";

/** Twilio-accessible URL for a technician headshot (MMS). */
export function technicianPhotoMediaUrl(params: {
  userId: string;
  photoUrl: string | null | undefined;
}): string | null {
  const { userId, photoUrl } = params;
  if (!photoUrl?.trim()) return null;

  if (isBlobStorageUrl(photoUrl)) {
    return `${getAppBaseUrl()}/api/twilio/sms/technician-photo?id=${encodeURIComponent(userId)}`;
  }

  return photoUrl;
}

/** Guest-safe technician photo URL (portal tracking, public pages). */
export function publicTechnicianPhotoUrl(params: {
  userId: string;
  photoUrl: string | null | undefined;
}): string | null {
  if (!params.photoUrl?.trim()) return null;
  const publicUrl = absolutePublicBlobUrl(params.photoUrl);
  if (publicUrl && !isBlobStorageUrl(publicUrl)) return publicUrl;
  return technicianPhotoMediaUrl(params);
}
