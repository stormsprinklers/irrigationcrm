"use client";

import { useEffect, useState } from "react";
import { format } from "date-fns";
import { ExternalLink, FileText } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { CustomerPropertyMap } from "@/components/customers/CustomerPropertyMap";

type RachioData = {
  linked: boolean;
  allowRun?: boolean;
  name?: string;
  status?: string;
  zones?: Array<{ id: string; name: string; runtime?: number; lastWateredDate?: number | null }>;
  schedules?: { scheduleRules: Array<{ name: string; enabled?: boolean; totalDuration?: number }> };
  events?: Array<{ zoneName?: string; startTime?: number }>;
};

type IrrigationZone = {
  id: string;
  stationNumber: number;
  name: string;
  wateringGuide: string | null;
  runMinutes: number | null;
};

type MapZone = {
  id: string;
  name: string;
  baseRuntimeMinutes: number | null;
};

type Attachment = {
  id: string;
  fileName: string;
  mimeType: string;
  url: string;
  createdAt: string;
};

type PropertyLocation = {
  name: string;
  address: string | null;
  city: string | null;
  state: string | null;
  zip: string | null;
};

type Props = {
  propertyId: string;
  property: PropertyLocation;
  features: { rachio: boolean };
  showTitle?: boolean;
};

function isImageAttachment(mimeType: string, fileName: string) {
  if (mimeType.startsWith("image/")) return true;
  return /\.(jpe?g|png|gif|webp|bmp|svg)$/i.test(fileName);
}

export function PortalPropertySection({ propertyId, property, features, showTitle = true }: Props) {
  const [rachio, setRachio] = useState<RachioData | null>(null);
  const [irrigation, setIrrigation] = useState<{
    propertyDiagramUrl: string | null;
    zones: IrrigationZone[];
    mapZones: MapZone[];
  } | null>(null);
  const [attachments, setAttachments] = useState<Attachment[]>([]);

  useEffect(() => {
    if (features.rachio) {
      fetch(`/api/portal/properties/${propertyId}/rachio`)
        .then((r) => r.json())
        .then(setRachio);
    }
    fetch(`/api/portal/properties/${propertyId}/irrigation`)
      .then((r) => r.json())
      .then(setIrrigation);
    fetch("/api/portal/attachments")
      .then((r) => (r.ok ? r.json() : { attachments: [] }))
      .then((data) => setAttachments(data.attachments ?? []));
  }, [propertyId, features.rachio]);

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

  const recommendedZones =
    irrigation?.zones.filter((z) => z.runMinutes != null || z.wateringGuide) ?? [];
  const mapZoneRuntimes =
    irrigation?.mapZones.filter((z) => z.baseRuntimeMinutes != null) ?? [];

  return (
    <div className="space-y-6">
      {showTitle ? (
        <div>
          <h2 className="font-display text-xl uppercase tracking-wide text-storm-navy">{property.name}</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            {[property.address, property.city, property.state, property.zip].filter(Boolean).join(", ")}
          </p>
        </div>
      ) : null}

      <CustomerPropertyMap
        location={{
          address: property.address,
          city: property.city,
          state: property.state,
          zip: property.zip,
        }}
      />

      {irrigation?.propertyDiagramUrl ? (
        <section className="portal-card">
          <h3 className="portal-section-title">Irrigation map</h3>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={irrigation.propertyDiagramUrl}
            alt="Property irrigation diagram"
            className="mt-3 max-w-full rounded-md border border-storm-ice"
          />
          {recommendedZones.length > 0 ? (
            <div className="mt-4">
              <p className="text-sm font-semibold text-storm-navy">Recommended run times</p>
              <ul className="mt-3 space-y-3">
                {recommendedZones.map((z) => (
                  <li key={z.id} className="rounded-md border border-storm-ice bg-storm-ice/30 p-3 text-sm">
                    <p className="font-medium text-storm-navy">
                      Station {z.stationNumber}: {z.name}
                    </p>
                    {z.runMinutes != null ? (
                      <p className="text-muted-foreground">Recommended run time: {z.runMinutes} min</p>
                    ) : null}
                    {z.wateringGuide ? (
                      <p className="mt-1 whitespace-pre-wrap text-muted-foreground">{z.wateringGuide}</p>
                    ) : null}
                  </li>
                ))}
              </ul>
            </div>
          ) : mapZoneRuntimes.length > 0 ? (
            <div className="mt-4">
              <p className="text-sm font-semibold text-storm-navy">Recommended run times</p>
              <ul className="mt-3 space-y-2 text-sm">
                {mapZoneRuntimes.map((z) => (
                  <li key={z.id} className="text-muted-foreground">
                    {z.name}: {z.baseRuntimeMinutes} min
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </section>
      ) : null}

      {features.rachio && rachio?.linked ? (
        <section className="portal-card space-y-4">
          <h3 className="portal-section-title">Smart irrigation — {rachio.name}</h3>
          <p className="text-sm text-muted-foreground">Status: {rachio.status ?? "Unknown"}</p>
          {rachio.zones?.length ? (
            <div>
              <p className="text-sm font-semibold text-storm-navy">Zones</p>
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
        </section>
      ) : null}

      {attachments.length > 0 ? (
        <section className="portal-card">
          <h3 className="portal-section-title">Documents &amp; photos</h3>
          <ul className="mt-3 space-y-2">
            {attachments.map((a) => (
              <li key={a.id}>
                <a
                  href={a.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-3 rounded-md border border-storm-ice p-3 text-sm hover:bg-storm-ice/40"
                >
                  {isImageAttachment(a.mimeType, a.fileName) ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={a.url} alt="" className="h-12 w-12 rounded object-cover" />
                  ) : (
                    <FileText className="h-8 w-8 shrink-0 text-storm-sky" />
                  )}
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium text-storm-navy">{a.fileName}</span>
                    <span className="text-xs text-muted-foreground">
                      {format(new Date(a.createdAt), "MMM d, yyyy")}
                    </span>
                  </span>
                  <ExternalLink className="h-4 w-4 shrink-0 text-muted-foreground" />
                </a>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
