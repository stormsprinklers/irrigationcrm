"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { ContentArea } from "@/components/layout/ContentArea";
import { PageHeader } from "@/components/layout/PageHeader";
import { useHolidayLightingFeatures } from "@/components/layout/CompanyBrandProvider";
import { Button } from "@/components/ui/button";
import {
  DEFAULT_HOLIDAY_CATALOG,
  type HolidayLightingCatalog,
  type HolidayPriceBookRow,
  type HolidayQuoteDefaults,
} from "@/lib/holiday-lighting/types";

export default function HolidayLightingCatalogSettingsPage() {
  const { enabled } = useHolidayLightingFeatures();
  const [catalog, setCatalog] = useState<HolidayLightingCatalog>(DEFAULT_HOLIDAY_CATALOG);
  const [prices, setPrices] = useState<HolidayPriceBookRow[]>([]);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);

  const defaults: HolidayQuoteDefaults =
    catalog.quoteDefaults ?? DEFAULT_HOLIDAY_CATALOG.quoteDefaults!;

  useEffect(() => {
    if (!enabled) {
      setLoading(false);
      return;
    }
    fetch("/api/settings/holiday-lighting")
      .then(async (r) => {
        const data = await r.json();
        if (!r.ok) throw new Error(data.error ?? "Failed");
        setCatalog(data.catalog);
        setPrices(data.prices ?? []);
      })
      .catch((err) => toast.error(err instanceof Error ? err.message : "Failed to load"))
      .finally(() => setLoading(false));
  }, [enabled]);

  function patchDefaults(patch: Partial<HolidayQuoteDefaults>) {
    setCatalog({
      ...catalog,
      quoteDefaults: { ...defaults, ...patch },
    });
  }

  function patchPrice(sku: string, patch: Partial<HolidayPriceBookRow>) {
    setPrices((prev) => prev.map((row) => (row.sku === sku ? { ...row, ...patch } : row)));
  }

  async function save() {
    setSaving(true);
    try {
      const res = await fetch("/api/settings/holiday-lighting", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          catalog,
          prices: prices.map((row) => ({
            sku: row.sku,
            unitPrice: row.unitPrice,
            unitCost: row.unitCost,
          })),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Save failed");
      setCatalog(data.catalog);
      setPrices(data.prices ?? prices);
      toast.success("Holiday lighting settings saved — SKUs are in the price book");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  if (!enabled) {
    return (
      <ContentArea className="max-w-2xl">
        <PageHeader breadcrumb={["Settings", "Holiday lighting"]} title="Holiday lighting" />
        <p className="text-sm text-muted-foreground">
          Turn on holiday lighting tools under{" "}
          <Link href="/settings" className="text-primary underline">
            Company → Industry features
          </Link>
          .
        </p>
      </ContentArea>
    );
  }

  return (
    <ContentArea className="max-w-3xl">
      <PageHeader
        breadcrumb={["Settings", "Holiday lighting"]}
        title="Holiday lighting"
        subtitle="Price-book SKUs are created automatically for buy, lease, and permanent lighting. Enter internal cost and customer price per foot (or each for trees and bushes)."
        actions={
          <Button size="sm" onClick={() => void save()} disabled={saving || loading}>
            {saving ? "Saving…" : "Save"}
          </Button>
        }
      />
      {loading ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : (
        <div className="space-y-4">
          <section className="rounded-lg border border-border bg-white p-4">
            <h3 className="text-sm font-semibold">Quote defaults</h3>
            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              <div>
                <label className="text-xs text-muted-foreground">Default light color</label>
                <select
                  className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                  value={defaults.defaultLightStyleKey}
                  onChange={(e) => patchDefaults({ defaultLightStyleKey: e.target.value })}
                >
                  {catalog.lightStyles.map((s) => (
                    <option key={s.key} value={s.key}>
                      {s.label}
                    </option>
                  ))}
                </select>
              </div>
              <label className="text-xs text-muted-foreground">
                Temporary buy first-year minimum ($)
                <input
                  type="number"
                  min={0}
                  step="1"
                  className="mt-1 w-full rounded-md border border-input px-3 py-2 text-sm"
                  value={defaults.temporaryYear1Minimum}
                  onChange={(e) =>
                    patchDefaults({ temporaryYear1Minimum: Number(e.target.value) || 0 })
                  }
                />
              </label>
              <label className="text-xs text-muted-foreground">
                Permanent first-year minimum ($)
                <input
                  type="number"
                  min={0}
                  step="1"
                  className="mt-1 w-full rounded-md border border-input px-3 py-2 text-sm"
                  value={defaults.permanentYear1Minimum}
                  onChange={(e) =>
                    patchDefaults({ permanentYear1Minimum: Number(e.target.value) || 0 })
                  }
                />
              </label>
            </div>
          </section>

          <section className="rounded-lg border border-border bg-white p-4">
            <h3 className="text-sm font-semibold">Price book SKUs</h3>
            <p className="mt-1 text-xs text-muted-foreground">
              Customer-facing price is what quotes use. Internal cost is for your books only.
            </p>
            <div className="mt-3 overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-xs text-muted-foreground">
                    <th className="py-2 pr-2 font-medium">Item</th>
                    <th className="py-2 pr-2 font-medium">SKU</th>
                    <th className="py-2 pr-2 font-medium">Cost</th>
                    <th className="py-2 font-medium">Customer price</th>
                  </tr>
                </thead>
                <tbody>
                  {prices.map((row) => (
                    <tr key={row.sku} className="border-b last:border-0">
                      <td className="py-2 pr-2">
                        {row.name}
                        <span className="ml-1 text-xs text-muted-foreground">/{row.unit}</span>
                      </td>
                      <td className="py-2 pr-2 font-mono text-xs">{row.sku}</td>
                      <td className="py-2 pr-2">
                        <input
                          type="number"
                          min={0}
                          step="0.01"
                          className="w-24 rounded-md border border-input px-2 py-1 text-sm"
                          value={row.unitCost ?? 0}
                          onChange={(e) =>
                            patchPrice(row.sku, { unitCost: Number(e.target.value) || 0 })
                          }
                        />
                      </td>
                      <td className="py-2">
                        <input
                          type="number"
                          min={0}
                          step="0.01"
                          className="w-24 rounded-md border border-input px-2 py-1 text-sm"
                          value={row.unitPrice}
                          onChange={(e) =>
                            patchPrice(row.sku, { unitPrice: Number(e.target.value) || 0 })
                          }
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </div>
      )}
    </ContentArea>
  );
}
