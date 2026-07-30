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
} from "@/lib/holiday-lighting/types";

export default function HolidayLightingCatalogSettingsPage() {
  const { enabled } = useHolidayLightingFeatures();
  const [catalog, setCatalog] = useState<HolidayLightingCatalog>(DEFAULT_HOLIDAY_CATALOG);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);

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
      toast.success("Catalog saved");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  if (!enabled) {
    return (
      <ContentArea className="max-w-2xl">
        <PageHeader breadcrumb={["Settings", "Holiday lighting"]} title="Holiday lighting catalog" />
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
        title="Holiday lighting catalog"
        subtitle="Map light styles and tree sizes to price book SKUs (parts $/ft, install $/ft, lease)."
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
