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
  return process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
}
