"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { nativeSelectClassName } from "@/components/ui/native-select";
import type { RachioDeviceSummary } from "@/lib/rachio/types";

type Props = {
  customerId: string;
  propertyId: string;
  onLinked: () => void;
};

export function RachioDeviceLinker({ customerId, propertyId, onLinked }: Props) {
  const [devices, setDevices] = useState<RachioDeviceSummary[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [loading, setLoading] = useState(true);
  const [linking, setLinking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/settings/rachio/devices")
      .then(async (r) => {
        const data = await r.json();
        if (!r.ok) throw new Error(data.error ?? "Failed to load devices");
        setDevices(data.devices ?? []);
      })
      .catch((err) => setError(err instanceof Error ? err.message : "Failed to load devices"))
      .finally(() => setLoading(false));
  }, []);

  async function linkDevice() {
    if (!selectedId) {
      toast.error("Select a controller");
      return;
    }
    setLinking(true);
    try {
      const res = await fetch(
        `/api/customers/${customerId}/properties/${propertyId}/rachio/link`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ deviceId: selectedId }),
        }
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to link controller");
      toast.success("Rachio controller linked");
      onLinked();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to link controller");
    } finally {
      setLinking(false);
    }
  }

  if (loading) {
    return <p className="text-sm text-muted-foreground">Loading Rachio devices…</p>;
  }

  if (error) {
    return (
      <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-900/50 dark:bg-amber-950/40 dark:text-amber-200">
        {error}. Configure and test your Rachio API key in Settings → Maintenance.
      </div>
    );
  }

  if (!devices.length) {
    return (
      <p className="text-sm text-muted-foreground">
        No Rachio controllers found on your company account.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
      <div className="flex-1">
        <label className="mb-1 block text-sm font-medium">Rachio controller</label>
        <select
          value={selectedId}
          onChange={(e) => setSelectedId(e.target.value)}
          className={nativeSelectClassName}
        >
          <option value="">Select a controller</option>
          {devices.map((device) => (
            <option key={device.id} value={device.id}>
              {device.name}
              {device.serialNumber ? ` · ${device.serialNumber}` : ""}
              {device.status ? ` (${device.status})` : ""}
            </option>
          ))}
        </select>
      </div>
      <Button type="button" onClick={() => void linkDevice()} disabled={linking || !selectedId}>
        {linking ? "Linking…" : "Link controller"}
      </Button>
    </div>
  );
}
