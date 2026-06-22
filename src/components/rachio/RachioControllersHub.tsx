"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Droplets, ExternalLink, Link2 } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { RachioDeviceOverview } from "@/lib/rachio/overview";

type CustomerOption = { id: string; name: string };
type PropertyOption = { id: string; name: string };

const selectClass =
  "flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm";

export function RachioControllersHub({ connected }: { connected: boolean }) {
  const [devices, setDevices] = useState<RachioDeviceOverview[]>([]);
  const [loading, setLoading] = useState(false);
  const [linkDevice, setLinkDevice] = useState<RachioDeviceOverview | null>(null);
  const [customers, setCustomers] = useState<CustomerOption[]>([]);
  const [properties, setProperties] = useState<PropertyOption[]>([]);
  const [customerId, setCustomerId] = useState("");
  const [propertyId, setPropertyId] = useState("");
  const [linking, setLinking] = useState(false);

  const loadOverview = useCallback(async () => {
    if (!connected) {
      setDevices([]);
      return;
    }
    setLoading(true);
    try {
      const res = await fetch("/api/settings/rachio/overview");
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to load Rachio controllers");
      setDevices(data.devices ?? []);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to load Rachio controllers");
      setDevices([]);
    } finally {
      setLoading(false);
    }
  }, [connected]);

  useEffect(() => {
    void loadOverview();
  }, [loadOverview]);

  useEffect(() => {
    if (!linkDevice) return;
    fetch("/api/customers")
      .then((r) => r.json())
      .then((data) => setCustomers(data.customers ?? []))
      .catch(() => toast.error("Failed to load customers"));
  }, [linkDevice]);

  useEffect(() => {
    if (!customerId) {
      setProperties([]);
      setPropertyId("");
      return;
    }
    fetch(`/api/customers/${customerId}/properties`)
      .then((r) => r.json())
      .then((data) => setProperties(Array.isArray(data) ? data : (data.properties ?? [])))
      .catch(() => toast.error("Failed to load properties"));
  }, [customerId]);

  async function submitLink() {
    if (!linkDevice || !customerId || !propertyId) {
      toast.error("Select a customer and property");
      return;
    }
    setLinking(true);
    try {
      const res = await fetch(
        `/api/customers/${customerId}/properties/${propertyId}/rachio/link`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ deviceId: linkDevice.id }),
        }
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to link controller");
      toast.success("Rachio controller linked");
      setLinkDevice(null);
      setCustomerId("");
      setPropertyId("");
      void loadOverview();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to link controller");
    } finally {
      setLinking(false);
    }
  }

  if (!connected) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Rachio controllers</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            Test your Rachio connection above to see controllers and link them to customer
            properties.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <>
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0">
          <div className="flex items-center gap-2">
            <Droplets className="h-4 w-4 text-storm-sky" />
            <CardTitle className="text-base">Rachio controllers</CardTitle>
          </div>
          <Button type="button" variant="outline" size="sm" onClick={() => void loadOverview()}>
            Refresh
          </Button>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Link each controller to a customer property, then run zones, view schedules, and stop
            watering from that property&apos;s profile.
          </p>

          {loading ? (
            <p className="text-sm text-muted-foreground">Loading controllers…</p>
          ) : !devices.length ? (
            <p className="text-sm text-muted-foreground">No controllers found on your Rachio account.</p>
          ) : (
            <ul className="divide-y rounded-md border">
              {devices.map((device) => (
                <li
                  key={device.id}
                  className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div className="min-w-0">
                    <p className="font-medium">{device.name}</p>
                    <p className="text-sm text-muted-foreground">
                      {device.serialNumber ? `SN ${device.serialNumber}` : "No serial"}
                      {device.model ? ` · ${device.model}` : ""}
                      {device.zoneCount ? ` · ${device.zoneCount} zones` : ""}
                    </p>
                    {device.linked && device.customerName && device.propertyName ? (
                      <p className="mt-1 text-sm">
                        Linked to{" "}
                        <span className="font-medium">{device.customerName}</span>
                        {" · "}
                        {device.propertyName}
                      </p>
                    ) : (
                      <p className="mt-1 text-sm text-amber-700">Not linked to a property yet</p>
                    )}
                  </div>
                  <div className="flex shrink-0 flex-wrap items-center gap-2">
                    <Badge variant={device.status === "ONLINE" ? "default" : "secondary"}>
                      {device.status ?? "Unknown"}
                    </Badge>
                    {device.linked && device.customerId ? (
                      <Button type="button" size="sm" asChild>
                        <Link href={`/customers/${device.customerId}?tab=properties`}>
                          <ExternalLink className="mr-1 h-4 w-4" />
                          Manage
                        </Link>
                      </Button>
                    ) : (
                      <Button type="button" size="sm" onClick={() => setLinkDevice(device)}>
                        <Link2 className="mr-1 h-4 w-4" />
                        Link to property
                      </Button>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      {linkDevice ? (
        <div className="fixed inset-0 z-[110] flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-md rounded-lg border border-border bg-white p-6 shadow-xl">
            <h2 className="text-lg font-semibold">Link Rachio controller</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              {linkDevice.name}
              {linkDevice.serialNumber ? ` · ${linkDevice.serialNumber}` : ""}
            </p>
            <div className="mt-4 grid gap-3">
              <div>
                <label className="mb-1 block text-sm font-medium">Customer</label>
                <select
                  value={customerId}
                  onChange={(e) => setCustomerId(e.target.value)}
                  className={selectClass}
                >
                  <option value="">Select customer</option>
                  {customers.map((customer) => (
                    <option key={customer.id} value={customer.id}>
                      {customer.name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium">Property</label>
                <select
                  value={propertyId}
                  onChange={(e) => setPropertyId(e.target.value)}
                  className={selectClass}
                  disabled={!customerId}
                >
                  <option value="">Select property</option>
                  {properties.map((property) => (
                    <option key={property.id} value={property.id}>
                      {property.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <div className="mt-6 flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => setLinkDevice(null)}>
                Cancel
              </Button>
              <Button
                type="button"
                onClick={() => void submitLink()}
                disabled={linking || !customerId || !propertyId}
              >
                {linking ? "Linking…" : "Link controller"}
              </Button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
