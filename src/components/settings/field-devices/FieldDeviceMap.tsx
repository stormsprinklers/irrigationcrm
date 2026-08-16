"use client";

import { useCallback, useEffect, useState } from "react";

type DeviceRow = {
  id: string;
  deviceId: string;
  deviceName: string | null;
  lat: number;
  lng: number;
  updatedAt: string;
  stale: boolean;
  mapEmbedUrl: string | null;
  user: { id: string; name: string; photoUrl: string | null; role: string };
};

export function FieldDeviceMap() {
  const [devices, setDevices] = useState<DeviceRow[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/settings/field-devices", { cache: "no-store" });
      const json = (await res.json()) as { devices?: DeviceRow[]; error?: string };
      if (!res.ok) {
        setError(json.error ?? "Could not load devices");
        return;
      }
      const next = json.devices ?? [];
      setDevices(next);
      setError(null);
      setSelectedId((current) => current ?? next[0]?.id ?? null);
    } catch {
      setError("Could not load devices");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    const id = window.setInterval(() => void load(), 15_000);
    return () => window.clearInterval(id);
  }, [load]);

  const selected = devices.find((d) => d.id === selectedId) ?? devices[0] ?? null;

  if (loading) {
    return <p className="text-sm text-muted-foreground">Loading field devices…</p>;
  }

  if (error) {
    return <p className="text-sm text-destructive">{error}</p>;
  }

  if (devices.length === 0) {
    return (
      <p className="rounded-lg border border-dashed p-6 text-sm text-muted-foreground">
        No iPads have reported a location yet. Once a technician is signed in on Radar with
        Always location permission, devices appear here.
      </p>
    );
  }

  return (
    <div className="grid gap-4 lg:grid-cols-[280px_1fr]">
      <ul className="space-y-2">
        {devices.map((device) => {
          const active = selected?.id === device.id;
          const when = new Date(device.updatedAt).toLocaleString([], {
            month: "short",
            day: "numeric",
            hour: "numeric",
            minute: "2-digit",
          });
          return (
            <li key={device.id}>
              <button
                type="button"
                onClick={() => setSelectedId(device.id)}
                className={`w-full rounded-lg border px-3 py-2 text-left text-sm ${
                  active ? "border-primary bg-primary/5" : "border-border bg-background"
                }`}
              >
                <p className="font-medium">{device.user.name}</p>
                <p className="text-xs text-muted-foreground">
                  {device.deviceName || "iPad"} · {when}
                </p>
                {device.stale ? (
                  <p className="mt-1 text-xs text-amber-700">No recent ping</p>
                ) : (
                  <p className="mt-1 text-xs text-emerald-700">Live</p>
                )}
              </button>
            </li>
          );
        })}
      </ul>

      <div className="overflow-hidden rounded-xl border bg-white">
        {selected?.mapEmbedUrl ? (
          <iframe
            key={`${selected.id}-${selected.updatedAt}`}
            title={`${selected.user.name} location`}
            src={selected.mapEmbedUrl}
            className="h-[480px] w-full border-0"
            loading="lazy"
            referrerPolicy="no-referrer-when-downgrade"
            allowFullScreen
          />
        ) : (
          <p className="p-6 text-sm text-muted-foreground">Map is unavailable.</p>
        )}
      </div>
    </div>
  );
}
