const GEOLOCATION_TIMEOUT_MS = 15_000;
const GEOLOCATION_TIMEOUT_RELAXED_MS = 20_000;

export type GeolocationResult =
  | { ok: true; lat: number; lng: number }
  | { ok: false; reason: "unsupported" | "denied" | "timeout" | "unavailable" };

function readPosition(
  options: PositionOptions
): Promise<GeolocationResult> {
  return new Promise((resolve) => {
    navigator.geolocation.getCurrentPosition(
      (position) => {
        resolve({
          ok: true,
          lat: position.coords.latitude,
          lng: position.coords.longitude,
        });
      },
      (error) => {
        if (error.code === error.PERMISSION_DENIED) {
          resolve({ ok: false, reason: "denied" });
          return;
        }
        if (error.code === error.TIMEOUT) {
          resolve({ ok: false, reason: "timeout" });
          return;
        }
        resolve({ ok: false, reason: "unavailable" });
      },
      options
    );
  });
}

/**
 * Request the device location. Tries a cached/coarse read first (works better on
 * iOS PWAs), then a high-accuracy retry if needed.
 */
export async function requestCurrentPosition(): Promise<GeolocationResult> {
  if (typeof navigator === "undefined" || !navigator.geolocation) {
    return { ok: false, reason: "unsupported" };
  }

  // Prefer a recent fix quickly (iOS often already has one from EN_ROUTE / Maps).
  const cached = await readPosition({
    enableHighAccuracy: false,
    timeout: GEOLOCATION_TIMEOUT_MS,
    maximumAge: 60_000,
  });
  if (cached.ok) return cached;
  if (cached.reason === "denied") return cached;

  return readPosition({
    enableHighAccuracy: true,
    timeout: GEOLOCATION_TIMEOUT_RELAXED_MS,
    maximumAge: 0,
  });
}
