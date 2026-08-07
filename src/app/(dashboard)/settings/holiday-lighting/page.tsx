"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { ContentArea } from "@/components/layout/ContentArea";
import { PageHeader } from "@/components/layout/PageHeader";
import { useHolidayLightingFeatures } from "@/components/layout/CompanyBrandProvider";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  DEFAULT_HOLIDAY_CATALOG,
  type HolidayLightingCatalog,
  type HolidayQuoteDefaults,
} from "@/lib/holiday-lighting/types";

export default function HolidayLightingCatalogSettingsPage() {
  const { enabled } = useHolidayLightingFeatures();
  const [catalog, setCatalog] = useState<HolidayLightingCatalog>(DEFAULT_HOLIDAY_CATALOG);
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

  async function save() {
    setSaving(true);
    try {
      const res = await fetch("/api/settings/holiday-lighting", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ catalog }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Save failed");
      setCatalog(data.catalog);
      toast.success("Holiday lighting settings saved");
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
        subtitle="Company-wide quote defaults and price-book SKU mapping for the lighting quoter."
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
            <p className="mt-1 text-xs text-muted-foreground">
              Company-wide for holiday lighting quotes. Error margin and lease are set here only —
              staff pick light style on each quote.
            </p>
            <div className="mt-4 space-y-4">
              <div>
                <label className="text-xs text-muted-foreground">Default light style</label>
                <select
                  className="mt-1 w-full max-w-sm rounded-md border border-input bg-background px-3 py-2 text-sm"
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
              <div>
                <label className="text-xs text-muted-foreground">
                  Error margin ({defaults.marginPct}%)
                </label>
                <input
                  type="range"
                  min={0}
                  max={25}
                  value={defaults.marginPct}
                  className="mt-1 w-full max-w-sm accent-primary"
                  onChange={(e) => patchDefaults({ marginPct: Number(e.target.value) })}
                />
              </div>
              <label className="flex items-center gap-2 text-sm">
                <Checkbox
                  checked={defaults.includeLease}
                  onCheckedChange={(checked) =>
                    patchDefaults({ includeLease: Boolean(checked) })
                  }
                />
                Include lease option
              </label>
            </div>
          </section>

          <section className="rounded-lg border border-border bg-white p-4">
            <h3 className="text-sm font-semibold">Light styles</h3>
            <ul className="mt-3 space-y-3 text-sm">
              {catalog.lightStyles.map((style, idx) => (
                <li key={style.key} className="grid gap-2 rounded-md border p-3 sm:grid-cols-2">
                  <p className="font-medium sm:col-span-2">{style.label}</p>
                  <label className="text-xs text-muted-foreground">
                    Parts SKU
                    <input
                      className="mt-1 w-full rounded-md border border-input px-2 py-1.5 font-mono text-xs"
                      value={style.partsSku}
                      onChange={(e) => {
                        const next = [...catalog.lightStyles];
                        next[idx] = { ...style, partsSku: e.target.value };
                        setCatalog({ ...catalog, lightStyles: next });
                      }}
                    />
                  </label>
                  <label className="text-xs text-muted-foreground">
                    Install SKU
                    <input
                      className="mt-1 w-full rounded-md border border-input px-2 py-1.5 font-mono text-xs"
                      value={style.installSku}
                      onChange={(e) => {
                        const next = [...catalog.lightStyles];
                        next[idx] = { ...style, installSku: e.target.value };
                        setCatalog({ ...catalog, lightStyles: next });
                      }}
                    />
                  </label>
                  <label className="text-xs text-muted-foreground sm:col-span-2">
                    Lease SKU
                    <input
                      className="mt-1 w-full rounded-md border border-input px-2 py-1.5 font-mono text-xs"
                      value={style.leaseSku ?? ""}
                      onChange={(e) => {
                        const next = [...catalog.lightStyles];
                        next[idx] = { ...style, leaseSku: e.target.value || undefined };
                        setCatalog({ ...catalog, lightStyles: next });
                      }}
                    />
                  </label>
                </li>
              ))}
            </ul>
          </section>
          <section className="rounded-lg border border-border bg-white p-4">
            <h3 className="text-sm font-semibold">Trees &amp; bushes</h3>
            <ul className="mt-3 space-y-2 text-sm">
              {catalog.placements.map((p) => (
                <li key={p.key} className="flex justify-between gap-2 border-b py-2 last:border-0">
                  <span>{p.label}</span>
                  <span className="font-mono text-xs text-muted-foreground">{p.sku}</span>
                </li>
              ))}
            </ul>
          </section>
        </div>
      )}
    </ContentArea>
  );
}
