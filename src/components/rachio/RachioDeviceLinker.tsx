"use client";

import { useState } from "react";
import { Loader2, Plus } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { nativeSelectClassName } from "@/components/ui/native-select";
import type { RachioDeviceKind } from "@/lib/rachio/types";

type DeviceOption = {
  id: string;
  name: string;
  kind: RachioDeviceKind;
  serialNumber?: string | null;
  status?: string | null;
  linked?: boolean;
};

type Props = {
  customerId: string;
  propertyId: string;
  onLinked: () => void;
};

function kindLabel(kind: RachioDeviceKind) {
  return kind === "hose_timer" ? "Hose timer" : "Controller";
}

export function RachioDeviceLinker({ customerId, propertyId, onLinked }: Props) {
  const [picking, setPicking] = useState(false);
  const [devices, setDevices] = useState<DeviceOption[]>([]);
  const [selectedKey, setSelectedKey] = useState("");
  const [loading, setLoading] = useState(false);
  const [linking, setLinking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function startLookup() {
    setPicking(true);
    setLoading(true);
    setError(null);
    setSelectedKey("");
    try {
      const res = await fetch("/api/settings/rachio/overview");
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to load devices");
      const options: DeviceOption[] = (data.devices ?? []).map(
        (device: {
          id: string;
          name?: string | null;
          kind: RachioDeviceKind;
          serialNumber?: string | null;
          status?: string | null;
          linked?: boolean;
        }) => ({
          id: device.id,
          name: device.name ?? "Unnamed device",
          kind: device.kind ?? "controller",
          serialNumber: device.serialNumber,
          status: device.status,
          linked: Boolean(device.linked),
        })
      );
      setDevices(options);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load devices");
      setDevices([]);
    } finally {
      setLoading(false);
    }
  }

  function cancelLookup() {
    setPicking(false);
    setDevices([]);
    setSelectedKey("");
    setError(null);
    setLoading(false);
  }

  async function linkDevice() {
    if (!selectedKey) {
      toast.error("Select a Rachio timer");
      return;
    }
    const [kind, ...idParts] = selectedKey.split(":");
    const deviceId = idParts.join(":");
    if (!deviceId || (kind !== "controller" && kind !== "hose_timer")) {
      toast.error("Select a Rachio timer");
      return;
    }
    setLinking(true);
    try {
      const res = await fetch(
        `/api/customers/${customerId}/properties/${propertyId}/rachio/link`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ deviceId, deviceKind: kind }),
        }
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to link Rachio timer");
      toast.success("Rachio timer linked");
      onLinked();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to link Rachio timer");
    } finally {
      setLinking(false);
    }
  }

  if (!picking) {
    return (
      <Button type="button" variant="outline" size="sm" onClick={() => void startLookup()}>
        <Plus className="mr-1 h-4 w-4" />
        Add Rachio Timer
      </Button>
    );
  }

  if (loading) {
    return (
      <p className="flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" />
        Looking up Rachio timers…
      </p>
    );
  }

  if (error) {
    return (
      <div className="space-y-3">
        <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-900/50 dark:bg-amber-950/40 dark:text-amber-200">
          {error}. Configure and test your Rachio API key in Settings → Maintenance.
        </div>
        <Button type="button" variant="outline" size="sm" onClick={cancelLookup}>
          Cancel
        </Button>
      </div>
    );
  }

  if (!devices.length) {
    return (
      <div className="space-y-3">
        <p className="text-sm text-muted-foreground">
          No Rachio controllers or hose timers found on your company account.
        </p>
        <Button type="button" variant="outline" size="sm" onClick={cancelLookup}>
          Cancel
        </Button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
      <div className="flex-1">
        <label className="mb-1 block text-sm font-medium">Rachio timer</label>
        <select
          value={selectedKey}
          onChange={(e) => setSelectedKey(e.target.value)}
          className={nativeSelectClassName}
        >
          <option value="">Select a timer</option>
          {devices.map((device) => (
            <option key={`${device.kind}:${device.id}`} value={`${device.kind}:${device.id}`}>
              {device.name}
              {device.serialNumber ? ` · ${device.serialNumber}` : ""}
              {` · ${kindLabel(device.kind)}`}
              {device.status ? ` (${device.status})` : ""}
              {device.linked ? " · already linked" : ""}
            </option>
          ))}
        </select>
      </div>
      <div className="flex gap-2">
        <Button type="button" variant="outline" onClick={cancelLookup} disabled={linking}>
          Cancel
        </Button>
        <Button type="button" onClick={() => void linkDevice()} disabled={linking || !selectedKey}>
          {linking ? "Linking…" : "Link timer"}
        </Button>
      </div>
    </div>
  );
}
