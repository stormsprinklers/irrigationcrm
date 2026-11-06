"use client";

import { Fragment, useEffect, useState } from "react";
import Link from "next/link";
import { Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { ContentArea } from "@/components/layout/ContentArea";
import { PageHeader } from "@/components/layout/PageHeader";
import { useHolidayLightingFeatures } from "@/components/layout/CompanyBrandProvider";
import { Button } from "@/components/ui/button";
import {
  DEFAULT_HOLIDAY_CATALOG,
  type HolidayLightingCatalog,
  type HolidayDifficulty,
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

  function addBackendItem(sku: string) {
    setPrices((previous) => previous.map((row) => row.sku === sku ? {
      ...row,
      backendItemsConfigured: true,
      backendItems: [...row.backendItems, {
        id: `new-${crypto.randomUUID()}`,
        name: "",
        quantity: 1,
        contractorCost: 0,
        msrp: 0,
      }],
    } : row));
  }

  function patchBackendItem(sku: string, id: string, patch: Partial<HolidayPriceBookRow["backendItems"][number]>) {
    setPrices((previous) => previous.map((row) => row.sku === sku ? {
      ...row,
      backendItems: row.backendItems.map((item) => item.id === id ? { ...item, ...patch } : item),
    } : row));
  }

  function removeBackendItem(sku: string, id: string) {
    setPrices((previous) => previous.map((row) => row.sku === sku ? {
      ...row,
      backendItemsConfigured: true,
      backendItems: row.backendItems.filter((item) => item.id !== id),
    } : row));
  }

  function patchDifficultyMultiplier(difficulty: HolidayDifficulty, value: number) {
    setCatalog({
      ...catalog,
      difficultyMultipliers: {
        1: catalog.difficultyMultipliers?.[1] ?? 1,
        2: catalog.difficultyMultipliers?.[2] ?? 1.25,
        3: catalog.difficultyMultipliers?.[3] ?? 1.5,
        [difficulty]: value,
      },
    });
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
            backendItems: row.backendItems,
            backendItemsConfigured: row.backendItemsConfigured,
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
        subtitle="Set outward pricing, itemized cancellation MSRP and contractor costs, job minimums, and tree/bush difficulty multipliers."
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
                <label className="text-xs text-muted-foreground">Default light type</label>
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
                Seasonal holiday job minimum ($)
                <input
                  type="number"
                  min={0}
                  step="1"
                  className="mt-1 w-full rounded-md border border-input px-3 py-2 text-sm"
                  value={defaults.temporaryYear1Minimum}
                  onChange={(e) => {
                    if (e.target.value === "") return;
                    patchDefaults({ temporaryYear1Minimum: Number(e.target.value) });
                  }}
                />
              </label>
              <label className="text-xs text-muted-foreground">
                Permanent holiday job minimum ($)
                <input
                  type="number"
                  min={0}
                  step="1"
                  className="mt-1 w-full rounded-md border border-input px-3 py-2 text-sm"
                  value={defaults.permanentYear1Minimum}
                  onChange={(e) => {
                    if (e.target.value === "") return;
                    patchDefaults({ permanentYear1Minimum: Number(e.target.value) });
                  }}
                />
              </label>
            </div>
            <div className="mt-4 border-t border-border pt-4">
              <h4 className="text-xs font-semibold">Tree and bush difficulty multipliers</h4>
              <p className="mt-1 text-xs text-muted-foreground">Applied to the outward per-strand service price. Backend material cost is not multiplied.</p>
              <div className="mt-3 grid gap-3 sm:grid-cols-3">
                {([1, 2, 3] as const).map((difficulty) => (
                  <label key={difficulty} className="text-xs text-muted-foreground">
                    Difficulty {difficulty} multiplier
                    <input
                      type="number"
                      min={0.01}
                      max={10}
                      step="0.05"
                      className="mt-1 w-full rounded-md border border-input px-3 py-2 text-sm"
                      value={catalog.difficultyMultipliers?.[difficulty] ?? (difficulty === 2 ? 1.25 : difficulty === 3 ? 1.5 : 1)}
                      onChange={(event) => {
                        if (event.target.value === "") return;
                        patchDifficultyMultiplier(difficulty, Math.max(0.01, Math.min(10, Number(event.target.value))));
                      }}
                    />
                  </label>
                ))}
              </div>
            </div>
          </section>

          <section className="rounded-lg border border-border bg-white p-4">
            <h3 className="text-sm font-semibold">Price book SKUs</h3>
            <p className="mt-1 text-xs text-muted-foreground">
              Each priced service can include multiple backend materials. MSRP builds the customer cancellation fee; contractor cost is internal and feeds visit job costing. Permanent-lighting materials are used only for internal job costing.
            </p>
            <div className="mt-3 overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-xs text-muted-foreground">
                    <th className="py-2 pr-2 font-medium">Item</th>
                    <th className="py-2 pr-2 font-medium">SKU</th>
                    <th className="py-2 pr-2 font-medium">Contractor total</th>
                    <th className="py-2 pr-2 font-medium">Cancellation MSRP</th>
                    <th className="py-2 font-medium">Outward customer price</th>
                  </tr>
                </thead>
                <tbody>
                  {prices.map((row) => {
                    const contractorTotal = row.backendItems.length
                      ? row.backendItems.reduce((sum, item) => sum + item.quantity * item.contractorCost, 0)
                      : Number(row.unitCost ?? 0);
                    const msrpTotal = row.backendItems.length
                      ? row.backendItems.reduce((sum, item) => sum + item.quantity * item.msrp, 0)
                      : Number(row.unitCost ?? 0);
                    return <Fragment key={row.sku}>
                    <tr className="border-b">
                      <td className="py-2 pr-2">
                        {row.name}
                        <span className="ml-1 text-xs text-muted-foreground">/{row.unit}</span>
                      </td>
                      <td className="py-2 pr-2 font-mono text-xs">{row.sku}</td>
                      <td className="py-2 pr-2 font-medium">${contractorTotal.toFixed(2)}</td>
                      <td className="py-2 pr-2 font-medium">${msrpTotal.toFixed(2)}</td>
                      <td className="py-2">
                        <input
                          type="number"
                          min={0}
                          step="0.01"
                          className="w-24 rounded-md border border-input px-2 py-1 text-sm"
                          value={row.unitPrice}
                          onChange={(e) => {
                            if (e.target.value === "") return;
                            patchPrice(row.sku, { unitPrice: Number(e.target.value) });
                          }}
                        />
                      </td>
                    </tr>
                    <tr className="border-b bg-muted/20 last:border-0">
                      <td colSpan={5} className="px-3 py-3">
                        <div className="flex items-center justify-between gap-3">
                          <div>
                            <p className="text-xs font-semibold">Backend materials per {row.unit}</p>
                            {!row.backendItems.length ? <p className="text-xs text-muted-foreground">No itemized materials yet. The legacy flat backend cost is ${Number(row.unitCost ?? 0).toFixed(2)}.</p> : null}
                          </div>
                          <Button type="button" size="sm" variant="outline" onClick={() => addBackendItem(row.sku)}>
                            <Plus className="h-3.5 w-3.5" /> Add material
                          </Button>
                        </div>
                        {row.backendItems.length ? <div className="mt-3 space-y-2">
                          <div className="hidden grid-cols-[minmax(140px,1fr)_90px_120px_120px_36px] gap-2 text-[11px] font-medium text-muted-foreground sm:grid">
                            <span>Material</span><span>Quantity</span><span>Contractor cost</span><span>MSRP</span><span />
                          </div>
                          {row.backendItems.map((item) => <div key={item.id} className="grid gap-2 rounded-md border bg-white p-2 sm:grid-cols-[minmax(140px,1fr)_90px_120px_120px_36px]">
                            <input className="h-9 rounded-md border border-input px-2 text-sm" placeholder="Bulbs, timer, clips…" value={item.name} onChange={(event) => patchBackendItem(row.sku, item.id, { name: event.target.value })} />
                            <input className="h-9 rounded-md border border-input px-2 text-sm" type="number" min={0.001} step="0.001" value={item.quantity} onChange={(event) => event.target.value !== "" && patchBackendItem(row.sku, item.id, { quantity: Number(event.target.value) })} />
                            <input className="h-9 rounded-md border border-input px-2 text-sm" type="number" min={0} step="0.01" value={item.contractorCost} onChange={(event) => event.target.value !== "" && patchBackendItem(row.sku, item.id, { contractorCost: Number(event.target.value) })} />
                            <input className="h-9 rounded-md border border-input px-2 text-sm" type="number" min={0} step="0.01" value={item.msrp} onChange={(event) => event.target.value !== "" && patchBackendItem(row.sku, item.id, { msrp: Number(event.target.value) })} />
                            <Button type="button" variant="ghost" size="icon" aria-label={`Remove ${item.name || "material"}`} onClick={() => removeBackendItem(row.sku, item.id)}><Trash2 className="h-4 w-4" /></Button>
                          </div>)}
                        </div> : null}
                      </td>
                    </tr>
                    </Fragment>;
                  })}
                </tbody>
              </table>
            </div>
          </section>
        </div>
      )}
    </ContentArea>
  );
}
