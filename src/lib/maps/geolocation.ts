const GEOLOCATION_TIMEOUT_MS = 10_000;

export type GeolocationResult =
  | { ok: true; lat: number; lng: number }
  | { ok: false; reason: "unsupported" | "denied" | "timeout" | "unavailable" };

export function requestCurrentPosition(): Promise<GeolocationResult> {
  if (typeof navigator === "undefined" || !navigator.geolocation) {
    return Promise.resolve({ ok: false, reason: "unsupported" });
  }

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
      { enableHighAccuracy: true, timeout: GEOLOCATION_TIMEOUT_MS, maximumAge: 0 }
    );
  });
}
