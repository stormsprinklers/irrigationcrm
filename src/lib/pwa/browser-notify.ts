const INCOMING_CALL_TAG = "radar-incoming-call";

export async function ensureNotificationPermission() {
  if (typeof window === "undefined" || !("Notification" in window)) return "unsupported";
  if (Notification.permission === "granted" || Notification.permission === "denied") {
    return Notification.permission;
  }
  try {
    return await Notification.requestPermission();
  } catch {
    return "denied";
  }
}

export async function showIncomingCallBrowserNotification(params: {
  title: string;
  body: string;
}) {
  return showTaggedBrowserNotification({
    ...params,
    tag: INCOMING_CALL_TAG,
    requireInteraction: true,
    silent: true,
    kind: "incoming-call",
  });
}

export async function showMissedCallBrowserNotification(params: {
  title: string;
  body: string;
}) {
  return showTaggedBrowserNotification({
    ...params,
    tag: "radar-missed-call",
    requireInteraction: false,
    silent: false,
    kind: "missed-call",
  });
}

async function showTaggedBrowserNotification(params: {
  title: string;
  body: string;
  tag: string;
  requireInteraction: boolean;
  silent: boolean;
  kind: string;
}) {
  if (typeof window === "undefined" || !("Notification" in window)) return;
  if (Notification.permission === "default") {
    await ensureNotificationPermission();
  }
  if (Notification.permission !== "granted") return;

  const options: NotificationOptions = {
    body: params.body,
    icon: "/icon-192.png",
    badge: "/icon-192.png",
    tag: params.tag,
    requireInteraction: params.requireInteraction,
    silent: params.silent,
    data: { href: "/", kind: params.kind },
  };

  try {
    const registration =
      (await navigator.serviceWorker.getRegistration("/")) ??
      (await navigator.serviceWorker.ready.catch(() => null));
    if (registration?.showNotification) {
      await registration.showNotification(params.title, options);
      return;
    }
  } catch {
    // fall through to the page Notification constructor
  }

  try {
    const existing = new Notification(params.title, options);
    existing.onclick = () => {
      window.focus();
      existing.close();
    };
  } catch {
    /* some browsers block Notification from unfocused workers only */
  }
}

export async function closeIncomingCallBrowserNotification() {
  if (typeof window === "undefined" || !("serviceWorker" in navigator)) return;
  try {
    const registration = await navigator.serviceWorker.getRegistration("/");
    const notifications = await registration?.getNotifications?.({ tag: INCOMING_CALL_TAG });
    notifications?.forEach((notification) => notification.close());
  } catch {
    /* ignore */
  }
}
