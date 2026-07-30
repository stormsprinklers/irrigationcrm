declare global {
  interface Window {
    google?: typeof google;
    __gmapsPromise?: Promise<typeof google>;
  }
}

export function getBrowserMapsApiKey() {
  return (
    process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY ||
    process.env.NEXT_PUBLIC_GOOGLE_MAPS_KEY ||
    ""
  );
}

async function resolveMapsApiKey(): Promise<string> {
  const fromEnv = getBrowserMapsApiKey();
  if (fromEnv) return fromEnv;

  const res = await fetch("/api/holiday-lighting/maps-key");
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(
      (data as { error?: string }).error ||
        "Google Maps API key is not configured (set GOOGLE_MAPS_API_KEY)"
    );
  }
  const data = (await res.json()) as { key?: string };
  if (!data.key) throw new Error("Google Maps API key is not configured");
  return data.key;
}

/** Load Maps JS API once (Map + Street View + Geometry). */
export function loadGoogleMaps(): Promise<typeof google> {
  if (typeof window === "undefined") {
    return Promise.reject(new Error("Maps can only load in the browser"));
  }
  if (typeof window.google?.maps?.Map === "function") {
    return Promise.resolve(window.google);
  }
  if (window.__gmapsPromise) return window.__gmapsPromise;

  window.__gmapsPromise = (async () => {
    const key = await resolveMapsApiKey();
    await new Promise<void>((resolve, reject) => {
      const existing = document.querySelector<HTMLScriptElement>(
        'script[data-holiday-maps="1"]'
      );
      if (existing) {
        if (typeof window.google?.maps?.Map === "function") {
          resolve();
          return;
        }
        existing.addEventListener("load", () => resolve());
        existing.addEventListener("error", () =>
          reject(new Error("Google Maps script error"))
        );
        return;
      }
      const script = document.createElement("script");
      script.dataset.holidayMaps = "1";
      // Do not use loading=async — that breaks `google.maps.Map` for the 2D measure panel.
      script.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(
        key
      )}&libraries=geometry&v=weekly`;
      script.async = true;
      script.onload = () => resolve();
      script.onerror = () => reject(new Error("Google Maps script error"));
      document.head.appendChild(script);
    });
    if (typeof window.google?.maps?.Map !== "function") {
      throw new Error("Google Maps failed to load");
    }
    return window.google;
  })();

  return window.__gmapsPromise;
}

/** True if a Maps key is available via public env or will be fetched from the API. */
export function mapsKeyLikelyConfigured() {
  return Boolean(getBrowserMapsApiKey()) || true;
}
