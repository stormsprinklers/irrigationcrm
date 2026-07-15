"use client";

import { useCallback, useEffect, useState } from "react";
import { MarketingMetricGrid } from "@/components/marketing/MarketingMetricGrid";
import { Button } from "@/components/ui/button";
import type { AttributionKpis } from "@/lib/marketing/attribution-kpis";

function formatCurrency(value: number | null | undefined) {
  if (value == null) return "—";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(value);
}

function formatRoas(value: number | null | undefined) {
  if (value == null) return "—";
  return `${value.toFixed(2)}x`;
}

function formatPercent(value: number | null | undefined) {
  if (value == null) return "—";
  return `${(value * 100).toFixed(1)}%`;
}

export function MarketingAttributionKpiStrip() {
  const [rangeQuery, setRangeQuery] = useState("days=30");
  const [kpis, setKpis] = useState<AttributionKpis | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/marketing/attribution-kpis?${rangeQuery}`);
      if (!res.ok) throw new Error("Failed to load");
      setKpis(await res.json());
    } catch {
      setKpis(null);
    } finally {
      setLoading(false);
    }
  }, [rangeQuery]);

  useEffect(() => {
    void load();
  }, [load]);

  const isPresetActive = (days: number) => rangeQuery === `days=${days}`;
  const isAllTimeActive = rangeQuery === "preset=all";

  const channelRoasHint = kpis?.roasByChannel
    .map((row) => `${row.label} ${formatRoas(row.roas)}`)
    .join(" · ");

  return (
    <div className="mb-8 space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-sm font-semibold text-foreground">Attribution & spend</h2>
          <p className="text-xs text-muted-foreground">
            {loading
              ? "Loading…"
              : kpis
                ? `${kpis.dateRange.label}${
                    !kpis.dateRange.isAllTime
                      ? ` (${kpis.dateRange.startDate} – ${kpis.dateRange.endDate})`
                      : ""
                  }${kpis.spendFromLiveApis ? " · live ad accounts" : ""}`
                : "Unable to load KPIs"}
          </p>
        </div>
        <div className="flex flex-wrap gap-1">
          {[7, 30, 90].map((days) => (
            <Button
              key={days}
              type="button"
              size="sm"
              variant={isPresetActive(days) ? "default" : "outline"}
              onClick={() => setRangeQuery(`days=${days}`)}
            >
              {days}d
            </Button>
          ))}
          <Button
            type="button"
            size="sm"
            variant={isAllTimeActive ? "default" : "outline"}
            onClick={() => setRangeQuery("preset=all")}
          >
            All time
          </Button>
        </div>
      </div>

      <MarketingMetricGrid
        comingSoon={false}
        columns={5}
        metrics={[
          {
            label: "Total ad spend",
            value: loading ? "…" : formatCurrency(kpis?.totalAdSpend),
          },
          {
            label: "Cost per lead",
            value: loading ? "…" : formatCurrency(kpis?.costPerLead ?? null),
            hint: kpis ? `${kpis.leadsInRange} leads` : undefined,
          },
          {
            label: "Average ROAS",
            value: loading ? "…" : formatRoas(kpis?.averageRoas),
            hint: "Paid first-touch revenue ÷ paid spend",
          },
          {
            label: "ROAS by channel",
            value: loading ? "…" : channelRoasHint || "—",
            hint: kpis
              ? kpis.roasByChannel
                  .map((r) => `${r.label}: ${formatCurrency(r.spend)} spend`)
                  .join(" · ")
              : undefined,
          },
          {
            label: "Ad spend % of revenue",
            value: loading ? "…" : formatPercent(kpis?.adSpendPercentOfRevenue),
            hint: kpis
              ? `${formatCurrency(kpis.invoiceRevenueInRange)} invoice revenue`
              : undefined,
          },
        ]}
      />
    </div>
  );
}
