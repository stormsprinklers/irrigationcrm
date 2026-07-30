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

/**
 * Load Maps JS API once with async loading so `google.maps.importLibrary` works
 * (required for maps3d / Photorealistic 3D).
 */
export function loadGoogleMaps(): Promise<typeof google> {
  if (typeof window === "undefined") {
    return Promise.reject(new Error("Maps can only load in the browser"));
  }
  if (window.google?.maps) return Promise.resolve(window.google);
  if (window.__gmapsPromise) return window.__gmapsPromise;

  window.__gmapsPromise = (async () => {
    const key = await resolveMapsApiKey();
    await new Promise<void>((resolve, reject) => {
      const existing = document.querySelector<HTMLScriptElement>(
        'script[data-holiday-maps="1"]'
      );
      if (existing) {
        if (window.google?.maps) {
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
      script.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(
        key
      )}&v=weekly&loading=async`;
      script.async = true;
      script.onload = () => resolve();
      script.onerror = () => reject(new Error("Google Maps script error"));
      document.head.appendChild(script);
    });
    if (!window.google?.maps) throw new Error("Google Maps failed to load");
    // Ensure core libraries used by the 2D measure panel are available.
    if (typeof window.google.maps.importLibrary === "function") {
      await window.google.maps.importLibrary("maps");
      try {
        await window.google.maps.importLibrary("geometry");
      } catch {
        /* optional */
      }
      try {
        await window.google.maps.importLibrary("streetView");
      } catch {
        /* optional — Street View still works via Map constructor in many builds */
      }
    }
    return window.google;
  })();

  return window.__gmapsPromise;
}

/** Load Photorealistic 3D Maps (`maps3d`) after the base Maps JS API is ready. */
export async function loadMaps3d(): Promise<Maps3dLibrary> {
  const g = await loadGoogleMaps();
  if (typeof g.maps.importLibrary !== "function") {
    throw new Error("This Maps API build does not support importLibrary / 3D Maps");
  }
  return (await g.maps.importLibrary("maps3d")) as Maps3dLibrary;
}

/** Minimal typing for the maps3d preview surface we use. */
export type Maps3dLibrary = {
  Map3DElement: new (options?: Record<string, unknown>) => HTMLElement & {
    center?: { lat: number; lng: number; altitude?: number };
    range?: number;
    tilt?: number;
    heading?: number;
    mode?: string;
    append: (...nodes: Node[]) => void;
    replaceChildren: (...nodes: Node[]) => void;
    flyCameraAround?: (opts: Record<string, unknown>) => void;
    stopCameraAnimation?: () => void;
  };
  MapMode?: { HYBRID: string; SATELLITE: string };
  Polyline3DElement: new (options?: Record<string, unknown>) => HTMLElement;
  Marker3DElement: new (options?: Record<string, unknown>) => HTMLElement;
  AltitudeMode?: {
    RELATIVE_TO_MESH: string;
    RELATIVE_TO_GROUND: string;
    CLAMP_TO_GROUND: string;
    ABSOLUTE: string;
  };
};

/** True if a Maps key is available via public env or will be fetched from the API. */
export function mapsKeyLikelyConfigured() {
  return Boolean(getBrowserMapsApiKey()) || true;
}
