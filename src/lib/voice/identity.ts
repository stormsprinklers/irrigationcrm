import { getAppBaseUrl } from "@/lib/app-url";

export function voiceClientIdentity(companyId: string, userId: string) {
  return `${companyId}_${userId}`;
}

export function parseVoiceClientIdentity(identity: string) {
  const idx = identity.indexOf("_");
  if (idx <= 0) return null;
  return {
    companyId: identity.slice(0, idx),
    userId: identity.slice(idx + 1),
  };
}

export function appBaseUrl() {
  return getAppBaseUrl();
}
