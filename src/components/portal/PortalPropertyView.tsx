"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { format } from "date-fns";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { PortalShell } from "./PortalShell";
import { CustomerPropertyMap } from "@/components/customers/CustomerPropertyMap";

type RachioData = {
  linked: boolean;
  allowRun?: boolean;
  name?: string;
  status?: string;
  deviceKind?: string;
  zones?: Array<{ id: string; name: string; zoneNumber?: number; runtime?: number; lastWateredDate?: number | null }>;
  schedules?: { scheduleRules: Array<{ name: string; enabled?: boolean; totalDuration?: number }> };
  current?: unknown;
  events?: Array<{ type?: string; zoneName?: string; startTime?: number; duration?: number }>;
};

type IrrigationZone = {
  id: string;
  stationNumber: number;
  name: string;
  mapX: number | null;
  mapY: number | null;
  wateringGuide: string | null;
  runMinutes: number | null;
};

export function PortalPropertyView({ slug, propertyId }: { slug: string; propertyId: string }) {
  const [me, setMe] = useState<{
    company: { name: string; emailLogoUrl: string | null; features: Record<string, boolean> };
    properties: Array<{ id: string; name: string; address: string | null; city: string | null; state: string | null; zip: string | null }>;
  } | null>(null);
  const [rachio, setRachio] = useState<RachioData | null>(null);
  const [irrigation, setIrrigation] = useState<{ propertyDiagramUrl: string | null; zones: IrrigationZone[] } | null>(null);

  const property = me?.properties.find((p) => p.id === propertyId);

  useEffect(() => {
    fetch("/api/portal/me")
      .then((r) => r.json())
      .then(setMe);
  }, []);

  useEffect(() => {
    if (!me) return;
    if (me.company.features.rachio) {
      fetch(`/api/portal/properties/${propertyId}/rachio`)
        .then((r) => r.json())
        .then(setRachio);
    }
    fetch(`/api/portal/properties/${propertyId}/irrigation`)
      .then((r) => r.json())
      .then(setIrrigation);
  }, [me, propertyId]);

  async function runZone(zoneId: string) {
    try {
      const res = await fetch(`/api/portal/properties/${propertyId}/rachio/zones/${zoneId}/start`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ durationMinutes: 5 }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed");
      toast.success("Zone started");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to start zone");
    }
  }

  if (!me || !property) return <p className="text-sm text-muted-foreground">Loading...</p>;

  return (
    <PortalShell slug={slug} companyName={me.company.name} emailLogoUrl={me.company.emailLogoUrl} features={me.company.features as never}>
      <div className="space-y-6">
        <Link href={`/portal/${slug}`} className="text-sm text-primary hover:underline">
          ← Back to portal
        </Link>
        <h1 className="text-2xl font-semibold">{property.name}</h1>

        <CustomerPropertyMap
          location={{
            address: property.address,
            city: property.city,
            state: property.state,
            zip: property.zip,
          }}
        />

        {irrigation?.propertyDiagramUrl ? (
          <section className="rounded-lg border border-border bg-white p-4">
            <h2 className="font-medium">Irrigation map</h2>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={irrigation.propertyDiagramUrl} alt="Property irrigation diagram" className="mt-2 max-w-full rounded" />
            {irrigation.zones.length > 0 ? (
              <ul className="mt-4 space-y-3">
                {irrigation.zones.map((z) => (
                  <li key={z.id} className="text-sm">
                    <p className="font-medium">
                      Station {z.stationNumber}: {z.name}
                    </p>
                    {z.runMinutes ? <p className="text-muted-foreground">Run time: {z.runMinutes} min</p> : null}
                    {z.wateringGuide ? <p className="mt-1 whitespace-pre-wrap">{z.wateringGuide}</p> : null}
                  </li>
                ))}
              </ul>
            ) : null}
          </section>
        ) : null}

        {me.company.features.rachio && rachio?.linked ? (
          <section className="rounded-lg border border-border bg-white p-4 space-y-4">
            <h2 className="font-medium">Smart irrigation — {rachio.name}</h2>
            <p className="text-sm text-muted-foreground">Status: {rachio.status ?? "Unknown"}</p>

            {rachio.zones?.length ? (
              <div>
                <p className="text-sm font-medium">Zones / valves</p>
                <ul className="mt-2 space-y-2">
                  {rachio.zones.map((z) => (
                    <li key={z.id} className="flex items-center justify-between text-sm">
                      <span>
                        {z.name}
                        {z.runtime ? ` · ${Math.round(z.runtime / 60)} min` : ""}
                        {z.lastWateredDate ? ` · Last: ${format(new Date(z.lastWateredDate), "MMM d")}` : ""}
                      </span>
                      {rachio.allowRun ? (
                        <Button size="sm" variant="outline" onClick={() => void runZone(z.id)}>
                          Run 5 min
                        </Button>
                      ) : null}
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}

            {rachio.schedules?.scheduleRules?.length ? (
              <div>
                <p className="text-sm font-medium">Schedules</p>
                <ul className="mt-1 text-sm text-muted-foreground">
                  {rachio.schedules.scheduleRules.map((s, i) => (
                    <li key={i}>
                      {s.name} {s.enabled === false ? "(disabled)" : ""}
                      {s.totalDuration ? ` — ${Math.round(s.totalDuration / 60)} min` : ""}
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}

            {rachio.events?.length ? (
              <div>
                <p className="text-sm font-medium">Recent watering (30 days)</p>
                <ul className="mt-1 text-sm text-muted-foreground max-h-40 overflow-y-auto">
                  {rachio.events.slice(0, 10).map((ev, i) => (
                    <li key={i}>
                      {ev.zoneName ?? "Zone"} — {ev.startTime ? format(new Date(ev.startTime), "MMM d, h:mm a") : ""}
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
          </section>
        ) : me.company.features.rachio ? (
          <p className="text-sm text-muted-foreground">No Rachio device linked to this property.</p>
        ) : null}
      </div>
    </PortalShell>
  );
}
