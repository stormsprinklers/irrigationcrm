"use client";

import type { Prisma } from "@prisma/client";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { HolidayStrandMapViewer } from "@/components/holiday-lighting/HolidayStrandMapViewer";
import {
  holidayStrandMapFromMetadata,
  type HolidayStrandMap,
} from "@/lib/holiday-lighting/strand-map";
import { blobProxyUrl } from "@/lib/blob/urls";
import { holidayVisitJobSummary, holidayVisitPlan } from "@/lib/holiday-lighting/visit-plan";
import { HOLIDAY_COLOR_PATTERNS, HOLIDAY_STRAND_COLORS } from "@/lib/holiday-lighting/types";

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
  visitId?: string;
  estimateId?: string;
  estimateOptionId?: string;
  optionLetter?: string | null;
  editable?: boolean;
  onMetadataUpdated?: (metadata: Record<string, unknown>) => void;
};

export function HolidayLightingPlanSection({
  designExportMetadata,
  mode,
  priceField = "purchaseTotal",
  title,
  description,
  lineItems = [],
  visitId,
  estimateId,
  estimateOptionId,
  optionLetter,
  editable = true,
  onMetadataUpdated,
}: Props) {
  const selectedMetadata = optionLetter
    ? holidayVisitPlan(
        designExportMetadata as Prisma.JsonValue | null,
        optionLetter
      ) ?? designExportMetadata
    : designExportMetadata;
  const strandMap: HolidayStrandMap | null = holidayStrandMapFromMetadata(
    selectedMetadata ?? null
  );
  const previewUrl =
    typeof selectedMetadata?.previewImageUrl === "string"
      ? selectedMetadata.previewImageUrl
      : null;

  const showMap = mode === "installer";
  const jobSummary = holidayVisitJobSummary(selectedMetadata, lineItems);
  const summaryColor = jobSummary?.colors[0] ?? "";
  const [strandColor, setStrandColor] = useState(jobSummary?.strandColor ?? "");
  const [colorPattern, setColorPattern] = useState(summaryColor);
  const [savingSpecs, setSavingSpecs] = useState(false);
  const isKnownColor = HOLIDAY_COLOR_PATTERNS.includes(
    colorPattern as (typeof HOLIDAY_COLOR_PATTERNS)[number]
  ) && colorPattern !== "Other";

  useEffect(() => {
    setStrandColor(jobSummary?.strandColor ?? "");
    setColorPattern(summaryColor);
  }, [jobSummary?.strandColor, summaryColor]);

  async function saveSpecs(next: { strandColor?: string; colorPattern?: string }) {
    const endpoint = visitId
      ? `/api/visits/${visitId}/holiday-lighting-specs`
      : estimateId && estimateOptionId
        ? `/api/estimates/${estimateId}/holiday-lighting-specs`
        : null;
    if (!endpoint || !editable) return;
    setSavingSpecs(true);
    try {
      const response = await fetch(endpoint, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...next,
          ...(estimateOptionId ? { optionId: estimateOptionId } : {}),
        }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error ?? "Could not update lighting specs");
      if (data.designExportMetadata) onMetadataUpdated?.(data.designExportMetadata);
      toast.success("Lighting specs updated");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not update lighting specs");
    } finally {
      setSavingSpecs(false);
    }
  }
  const bulbTypes = [
    ...new Set(strandMap?.features.map((feature) => feature.lightStyleLabel) ?? []),
  ];
  const notes =
    typeof selectedMetadata?.notes === "string"
      ? selectedMetadata.notes.trim()
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
          <div className="grid gap-3 sm:grid-cols-3">
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
            <div className="rounded-lg border border-amber-300 bg-white p-4">
              <p className="text-xs font-bold uppercase tracking-wider text-amber-800">
                Strand color
              </p>
              <p className="mt-1 text-2xl font-black text-slate-950">
                {jobSummary.strandColor || "Not specified"}
              </p>
            </div>
          </div>
          {editable && (visitId || (estimateId && estimateOptionId)) ? (
            <div className="grid gap-3 rounded-lg border border-amber-300 bg-white p-3 sm:grid-cols-2">
              <label className="text-xs font-semibold text-slate-700">
                Strand color
                <select
                  className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm font-normal"
                  value={strandColor}
                  disabled={savingSpecs}
                  onChange={(event) => {
                    const value = event.target.value;
                    setStrandColor(value);
                    void saveSpecs({ strandColor: value });
                  }}
                >
                  <option value="" disabled>Select strand color</option>
                  {HOLIDAY_STRAND_COLORS.map((color) => <option key={color} value={color}>{color}</option>)}
                </select>
              </label>
              <label className="text-xs font-semibold text-slate-700">
                Light color / pattern
                <select
                  className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm font-normal"
                  value={isKnownColor ? colorPattern : "Other"}
                  disabled={savingSpecs}
                  onChange={(event) => {
                    const value = event.target.value;
                    setColorPattern(value);
                    if (value !== "Other") void saveSpecs({ colorPattern: value });
                  }}
                >
                  {HOLIDAY_COLOR_PATTERNS.map((color) => <option key={color} value={color}>{color}</option>)}
                </select>
                {!isKnownColor ? (
                  <input
                    className="mt-2 w-full rounded-md border border-input bg-background px-3 py-2 text-sm font-normal"
                    value={colorPattern === "Other" ? "" : colorPattern}
                    disabled={savingSpecs}
                    placeholder="Describe the custom color or pattern"
                    onChange={(event) => setColorPattern(event.target.value || "Other")}
                    onBlur={(event) => {
                      const value = event.currentTarget.value.trim();
                      if (value) void saveSpecs({ colorPattern: value });
                    }}
                  />
                ) : null}
              </label>
            </div>
          ) : null}
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
            {typeof selectedMetadata?.previewDisclaimer === "string"
              ? selectedMetadata.previewDisclaimer
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
