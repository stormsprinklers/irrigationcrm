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
      data: { href: payload.href },
    })
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
