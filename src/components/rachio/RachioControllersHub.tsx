"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Droplets, ExternalLink, Link2, MapPin, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { CustomerSearchPicker } from "@/components/customers/CustomerSearchPicker";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import type { RachioDeviceOverview } from "@/lib/rachio/overview";

type PropertyOption = {
  id: string;
  name: string;
  address?: string | null;
  city?: string | null;
  state?: string | null;
  zip?: string | null;
};

function propertyAddressLine(property: PropertyOption) {
  return [property.address, property.city, property.state, property.zip]
    .filter(Boolean)
    .join(", ");
}

function kindLabel(kind: RachioDeviceOverview["kind"]) {
  return kind === "hose_timer" ? "Hose timer" : "Controller";
}

export function RachioControllersHub({ connected }: { connected: boolean }) {
  const [devices, setDevices] = useState<RachioDeviceOverview[]>([]);
  const [loading, setLoading] = useState(false);
  const [linkDevice, setLinkDevice] = useState<RachioDeviceOverview | null>(null);
  const [properties, setProperties] = useState<PropertyOption[]>([]);
  const [customerId, setCustomerId] = useState("");
  const [customerName, setCustomerName] = useState("");
  const [propertyId, setPropertyId] = useState("");
  const [linking, setLinking] = useState(false);

  const loadOverview = useCallback(async (signal?: AbortSignal) => {
    if (!connected) {
      setDevices([]);
      return;
    }
    setLoading(true);
    try {
      const res = await fetch("/api/settings/rachio/overview", { signal });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to load Rachio controllers");
      if (signal?.aborted) return;
      const list = Array.isArray(data.devices) ? data.devices : [];
      setDevices(
        list.filter(
          (device: RachioDeviceOverview) =>
            device && typeof device === "object" && typeof device.id === "string" && device.id
        )
      );
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") return;
      toast.error(err instanceof Error ? err.message : "Failed to load Rachio controllers");
      setDevices([]);
    } finally {
      if (!signal?.aborted) {
        setLoading(false);
      }
    }
  }, [connected]);

  useEffect(() => {
    const controller = new AbortController();
    void loadOverview(controller.signal);
    return () => controller.abort();
  }, [loadOverview]);

  useEffect(() => {
    if (!linkDevice) return;
    const suggestion = linkDevice.suggestedCustomer;
    if (suggestion) {
      setCustomerId(suggestion.customerId);
      setCustomerName(suggestion.customerName);
      setPropertyId(suggestion.propertyId ?? "");
    } else {
      setCustomerId("");
      setCustomerName("");
      setPropertyId("");
    }
  }, [linkDevice]);

  useEffect(() => {
    if (!customerId) {
      setProperties([]);
      if (!linkDevice?.suggestedCustomer?.propertyId) {
        setPropertyId("");
      }
      return;
    }
    fetch(`/api/customers/${customerId}/properties`)
      .then((r) => r.json())
      .then((data) => setProperties(Array.isArray(data) ? data : (data.properties ?? [])))
      .catch(() => toast.error("Failed to load properties"));
  }, [customerId, linkDevice?.suggestedCustomer?.propertyId]);

  useEffect(() => {
    if (!linkDevice?.suggestedCustomer?.propertyId || !properties.length) return;
    const suggestedId = linkDevice.suggestedCustomer.propertyId;
    if (properties.some((p) => p.id === suggestedId)) {
      setPropertyId(suggestedId);
    }
  }, [linkDevice, properties]);

  function closeLinkDialog() {
    setLinkDevice(null);
    setCustomerId("");
    setCustomerName("");
    setPropertyId("");
    setProperties([]);
  }

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
          body: JSON.stringify({
            deviceId: linkDevice.id,
            deviceKind: linkDevice.kind,
          }),
        }
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to link controller");
      toast.success("Rachio device linked");
      closeLinkDialog();
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
          <CardTitle className="text-base">Rachio controllers & timers</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            Test your Rachio connection above to see controllers, hose timers, and link them to
            customer properties.
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
            <CardTitle className="text-base">Rachio controllers & timers</CardTitle>
          </div>
          <Button type="button" variant="outline" size="sm" onClick={() => void loadOverview()}>
            Refresh
          </Button>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Link each Rachio device to a customer property. Addresses come from your Rachio home
            locations; we suggest a customer when the address matches exactly.
          </p>

          {loading ? (
            <p className="text-sm text-muted-foreground">Loading devices…</p>
          ) : !devices.length ? (
            <p className="text-sm text-muted-foreground">No Rachio devices found on your account.</p>
          ) : (
            <ul className="divide-y rounded-md border border-border">
              {devices.map((device) => (
                <li
                  key={`${device.kind}-${device.id}`}
                  className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-medium">{device.name ?? "Unnamed device"}</p>
                      <Badge variant="outline">{kindLabel(device.kind)}</Badge>
                    </div>
                    <p className="text-sm text-muted-foreground">
                      {device.serialNumber ? `SN ${device.serialNumber}` : "No serial"}
                      {device.model ? ` · ${device.model}` : ""}
                      {device.zoneCount ? ` · ${device.zoneCount} zones` : ""}
                    </p>
                    {device.addressLine ? (
                      <p className="mt-1 flex items-start gap-1 text-sm text-muted-foreground">
                        <MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                        <span>{device.addressLine}</span>
                      </p>
                    ) : (
                      <p className="mt-1 text-sm text-muted-foreground">No address on file in Rachio</p>
                    )}
                    {device.linked && device.customerName && device.propertyName ? (
                      <p className="mt-1 text-sm">
                        Linked to{" "}
                        <span className="font-medium">{device.customerName}</span>
                        {" · "}
                        {device.propertyName}
                      </p>
                    ) : device.suggestedCustomer ? (
                      <p className="mt-1 flex flex-wrap items-center gap-1 text-sm text-storm-sky">
                        <Sparkles className="h-3.5 w-3.5" />
                        <span>
                          Suggested:{" "}
                          <span className="font-medium">{device.suggestedCustomer.customerName}</span>
                          {device.suggestedCustomer.propertyName
                            ? ` · ${device.suggestedCustomer.propertyName}`
                            : ""}
                        </span>
                      </p>
                    ) : (
                      <p className="mt-1 text-sm text-amber-700">
                        Not linked to a property yet
                      </p>
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
          <div className="w-full max-w-md rounded-lg border border-border bg-card p-6 text-card-foreground shadow-xl">
            <h2 className="text-lg font-semibold">
              Link Rachio {kindLabel(linkDevice.kind).toLowerCase()}
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              {linkDevice.name}
              {linkDevice.serialNumber ? ` · ${linkDevice.serialNumber}` : ""}
            </p>
            {linkDevice.addressLine ? (
              <p className="mt-2 flex items-start gap-1 text-sm">
                <MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                <span>{linkDevice.addressLine}</span>
              </p>
            ) : null}
            {linkDevice.suggestedCustomer ? (
              <p className="mt-2 rounded-md border border-storm-sky/30 bg-storm-sky/5 px-3 py-2 text-sm">
                <span className="flex items-center gap-1 font-medium text-storm-sky">
                  <Sparkles className="h-3.5 w-3.5" />
                  Address matches {linkDevice.suggestedCustomer.customerName}
                  {linkDevice.suggestedCustomer.propertyName
                    ? ` (${linkDevice.suggestedCustomer.propertyName})`
                    : ""}
                </span>
              </p>
            ) : null}
            <div className="mt-4 grid gap-4">
              <div>
                <label className="mb-1 block text-sm font-medium">Customer</label>
                <CustomerSearchPicker
                  value={customerId}
                  selectedName={customerName}
                  onValueChange={(id, name) => {
                    setCustomerId(id);
                    setCustomerName(name);
                    setPropertyId("");
                  }}
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium">Property</label>
                {!customerId ? (
                  <p className="text-sm text-muted-foreground">Select a customer first.</p>
                ) : properties.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No properties for this customer.</p>
                ) : (
                  <ScrollArea className="max-h-40 rounded-md border border-border">
                    <ul>
                      {properties.map((property) => {
                        const addressLine = propertyAddressLine(property);
                        return (
                          <li key={property.id}>
                            <button
                              type="button"
                              onClick={() => setPropertyId(property.id)}
                              className={cn(
                                "flex w-full flex-col items-start px-3 py-2 text-left text-sm hover:bg-muted/50",
                                propertyId === property.id && "bg-highlight-panel"
                              )}
                            >
                              <span className="font-medium">{property.name}</span>
                              {addressLine ? (
                                <span className="text-xs text-muted-foreground">{addressLine}</span>
                              ) : null}
                            </button>
                          </li>
                        );
                      })}
                    </ul>
                  </ScrollArea>
                )}
              </div>
            </div>
            <div className="mt-6 flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={closeLinkDialog}>
                Cancel
              </Button>
              <Button
                type="button"
                onClick={() => void submitLink()}
                disabled={linking || !customerId || !propertyId}
              >
                {linking ? "Linking…" : "Link device"}
              </Button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
