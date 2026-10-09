/* Radar PWA service worker — push + notification click handling */

self.addEventListener("install", (event) => {
  event.waitUntil(self.skipWaiting());
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("push", (event) => {
  let payload = {
    title: "Radar",
    body: "You have a new notification",
    href: "/home",
  };

  try {
    if (event.data) {
      const data = event.data.json();
      payload = {
        title: typeof data.title === "string" && data.title ? data.title : payload.title,
        body: typeof data.body === "string" ? data.body : payload.body,
        href: typeof data.href === "string" && data.href ? data.href : payload.href,
      };
    }
  } catch {
    try {
      const text = event.data?.text();
      if (text) payload.body = text;
    } catch {
      /* ignore malformed payloads */
    }
  }

  event.waitUntil(
    self.registration.showNotification(payload.title, {
      body: payload.body,
      icon: "/icon-192.png",
      badge: "/icon-192.png",
      silent: false,
      data: { href: payload.href },
    })
  );
});

function urlBase64ToUint8Array(base64String) {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base64);
  return Uint8Array.from(raw, (character) => character.charCodeAt(0));
}

async function saveSubscription(subscription) {
  const json = subscription.toJSON();
  if (!json.endpoint || !json.keys?.p256dh || !json.keys?.auth) return;

  const response = await fetch("/api/push/subscribe", {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ endpoint: json.endpoint, keys: json.keys }),
  });
  if (!response.ok) throw new Error(`Subscription refresh failed (${response.status})`);
}

// Push services can rotate or expire a subscription while Radar is closed.
// Renew it in the worker and update the server record without requiring the
// employee to reinstall the PWA or toggle notifications manually.
self.addEventListener("pushsubscriptionchange", (event) => {
  event.waitUntil(
    (async () => {
      try {
        let subscription = event.newSubscription ?? null;
        if (!subscription) {
          let applicationServerKey = event.oldSubscription?.options?.applicationServerKey;
          if (!applicationServerKey) {
            const keyResponse = await fetch("/api/push/vapid-public-key", {
              credentials: "include",
              cache: "no-store",
            });
            if (!keyResponse.ok) return;
            const keyData = await keyResponse.json();
            if (!keyData.configured || !keyData.publicKey) return;
            applicationServerKey = urlBase64ToUint8Array(keyData.publicKey);
          }
          subscription = await self.registration.pushManager.subscribe({
            userVisibleOnly: true,
            applicationServerKey,
          });
        }
        await saveSubscription(subscription);
      } catch (error) {
        console.error("Push subscription renewal failed", error);
      }
    })()
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const href =
    event.notification?.data?.href && typeof event.notification.data.href === "string"
      ? event.notification.data.href
      : "/home";
  const targetUrl = new URL(href, self.location.origin).href;

  event.waitUntil(
    (async () => {
      const clients = await self.clients.matchAll({
        type: "window",
        includeUncontrolled: true,
      });
      for (const client of clients) {
        if ("focus" in client) {
          await client.focus();
          if ("navigate" in client && client.url !== targetUrl) {
            try {
              await client.navigate(targetUrl);
            } catch {
              /* navigate may fail on some browsers; open below */
            }
          }
          return;
        }
      }
      if (self.clients.openWindow) {
        await self.clients.openWindow(targetUrl);
      }
    })()
  );
});
