"use client";

import { HolidayStrandMapViewer } from "@/components/holiday-lighting/HolidayStrandMapViewer";
import {
  holidayStrandMapFromMetadata,
  type HolidayStrandMap,
} from "@/lib/holiday-lighting/strand-map";
import { blobProxyUrl } from "@/lib/blob/urls";

type Props = {
  designExportMetadata: Record<string, unknown> | null | undefined;
  mode: "customer" | "installer";
  priceField?: "purchaseTotal" | "leaseTotal";
  title?: string;
  description?: string;
};

export function HolidayLightingPlanSection({
  designExportMetadata,
  mode,
  priceField = "purchaseTotal",
  title,
  description,
}: Props) {
  const strandMap: HolidayStrandMap | null = holidayStrandMapFromMetadata(
    designExportMetadata ?? null
  );
  const previewUrl =
    typeof designExportMetadata?.previewImageUrl === "string"
      ? designExportMetadata.previewImageUrl
      : null;

  const showMap = mode === "installer";
  const totalFeet = strandMap?.features.reduce((total, feature) => total + feature.lengthFtWithMargin, 0) ?? 0;
  const bulbTypes = [...new Set(strandMap?.features.map(feature => feature.lightStyleLabel) ?? [])];
  const notes = typeof designExportMetadata?.notes === "string" ? designExportMetadata.notes.trim() : "";
  if (!previewUrl && !(showMap && strandMap)) return null;

  return (
    <section className="space-y-3 rounded-lg border border-border bg-white p-4">
      <div>
        <h3 className="font-medium">
          {title ?? (mode === "installer" ? "Holiday install map" : "Lighting preview")}
        </h3>
        {mode === "installer" || description ? (
          <p className="mt-1 text-sm text-muted-foreground">
            {description ??
              "Color-coded strands with label, cost, and linear feet including error margin."}
          </p>
        ) : null}
      </div>
      {showMap && strandMap ? (
        <div className="space-y-2 text-sm">
          <p><strong>Total length including margin:</strong> {totalFeet.toFixed(1)} ft</p>
          <p><strong>Bulb types:</strong> {bulbTypes.join(", ") || "Not specified"}</p>
          <p className="whitespace-pre-wrap"><strong>Notes:</strong> {notes || "No quote notes"}</p>
        </div>
      ) : null}
      {previewUrl ? (
        <div className="space-y-1">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={blobProxyUrl(previewUrl) ?? previewUrl}
            alt="Lighting preview"
            className="max-h-72 w-full rounded-md border border-border object-cover"
          />
          <p className="text-xs text-muted-foreground">
            {typeof designExportMetadata?.previewDisclaimer === "string"
              ? designExportMetadata.previewDisclaimer
              : "This preview is AI generated and is not a guarantee of exact light placement."}
          </p>
        </div>
      ) : null}
      {showMap && strandMap ? (
        <HolidayStrandMapViewer map={strandMap} mode={mode} priceField={priceField} />
      ) : null}
    </section>
  );
}
