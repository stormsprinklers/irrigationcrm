"use client";

import { HolidayStrandMapViewer } from "@/components/holiday-lighting/HolidayStrandMapViewer";
import {
  holidayStrandMapFromMetadata,
  type HolidayStrandMap,
} from "@/lib/holiday-lighting/strand-map";
import { blobProxyUrl } from "@/lib/blob/urls";
import { holidayVisitJobSummary } from "@/lib/holiday-lighting/visit-plan";

type SummaryLineItem = {
  name: string;
  description?: string | null;
};

type Props = {
  designExportMetadata: Record<string, unknown> | null | undefined;
  mode: "customer" | "installer";
  priceField?: "purchaseTotal" | "leaseTotal";
  title?: string;
  description?: string;
  lineItems?: SummaryLineItem[];
};

export function HolidayLightingPlanSection({
  designExportMetadata,
  mode,
  priceField = "purchaseTotal",
  title,
  description,
  lineItems = [],
}: Props) {
  const strandMap: HolidayStrandMap | null = holidayStrandMapFromMetadata(
    designExportMetadata ?? null
  );
  const previewUrl =
    typeof designExportMetadata?.previewImageUrl === "string"
      ? designExportMetadata.previewImageUrl
      : null;

  const showMap = mode === "installer";
  const jobSummary = holidayVisitJobSummary(designExportMetadata, lineItems);
  const bulbTypes = [
    ...new Set(strandMap?.features.map((feature) => feature.lightStyleLabel) ?? []),
  ];
  const notes =
    typeof designExportMetadata?.notes === "string"
      ? designExportMetadata.notes.trim()
      : "";
  if (!previewUrl && !(showMap && (strandMap || jobSummary))) return null;

  return (
    <section
      className={
        showMap
          ? "space-y-4 rounded-lg border-2 border-amber-400 bg-amber-50/60 p-4 shadow-sm"
          : "space-y-3 rounded-lg border border-border bg-white p-4"
      }
    >
      <div>
        <div className="flex flex-wrap items-center gap-2">
          <h3 className={showMap ? "text-lg font-bold" : "font-medium"}>
            {title ?? (mode === "installer" ? "Holiday install map" : "Lighting preview")}
          </h3>
          {showMap ? (
            <span className="rounded-full bg-amber-200 px-2 py-0.5 text-xs font-bold uppercase tracking-wide text-amber-950">
              Internal job specs
            </span>
          ) : null}
        </div>
        {mode === "installer" || description ? (
          <p className="mt-1 text-sm text-muted-foreground">
            {description ??
              "Color-coded strands with label, cost, and linear feet including error margin."}
          </p>
        ) : null}
      </div>
      {showMap && jobSummary ? (
        <div className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="rounded-lg border border-amber-300 bg-white p-4">
              <p className="text-xs font-bold uppercase tracking-wider text-amber-800">
                Linear feet
              </p>
              <p className="mt-1 text-3xl font-black text-slate-950">
                {jobSummary.totalFeet != null
                  ? `${jobSummary.totalFeet.toFixed(1)} ft`
                  : "Not specified"}
              </p>
            </div>
            <div className="rounded-lg border border-amber-300 bg-white p-4">
              <p className="text-xs font-bold uppercase tracking-wider text-amber-800">
                Light color / pattern
              </p>
              <p className="mt-1 text-2xl font-black text-slate-950">
                {jobSummary.colorLabel}
              </p>
            </div>
          </div>
          <div className="space-y-2 text-sm">
            <p>
              <strong>Bulb types:</strong> {bulbTypes.join(", ") || "Not specified"}
            </p>
            <p className="whitespace-pre-wrap">
              <strong>Notes:</strong> {notes || "No quote notes"}
            </p>
          </div>
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
