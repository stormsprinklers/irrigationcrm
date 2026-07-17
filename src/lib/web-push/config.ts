export function isWebPushConfigured() {
  return Boolean(
    process.env.VAPID_PUBLIC_KEY?.trim() && process.env.VAPID_PRIVATE_KEY?.trim()
  );
}

export function getVapidPublicKey() {
  return process.env.VAPID_PUBLIC_KEY?.trim() ?? "";
}

export function getVapidPrivateKey() {
  return process.env.VAPID_PRIVATE_KEY?.trim() ?? "";
}

/** mailto: or https: contact for VAPID — required by the Web Push protocol. */
export function getVapidSubject() {
  return process.env.VAPID_SUBJECT?.trim() || "mailto:support@stormsprinklers.com";
}
