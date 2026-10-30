"use client";

import { useCallback, useEffect, useState } from "react";
import { Loader2, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";

type PipelineRow = {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
  city: string | null;
  zip: string | null;
  createdAt: string;
  pipelineStage: string;
  pipelineLeadSource: string | null;
  qualifiedValue: number | null;
  convertedValue: number | null;
  soldValue: number | null;
};

type PipelineData = {
  rows: PipelineRow[];
  total: number;
  metrics: {
    leadCount: number;
    qualifiedCount: number;
    convertedCount: number;
    soldCount: number;
    qualifiedTotal: number;
    convertedTotal: number;
    soldTotal: number;
  };
};

function money(value: number | null | undefined) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(value ?? 0);
}

function date(value: string) {
  return new Intl.DateTimeFormat("en-US", { dateStyle: "medium" }).format(new Date(value));
}

export function AffiliatePipeline() {
  const [data, setData] = useState<PipelineData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/affiliate/pipeline");
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error ?? "Could not load pipeline");
      setData(body);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Could not load pipeline");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  return (
    <div className="mx-auto max-w-7xl space-y-6 px-4 py-8 sm:px-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div><h1 className="font-display text-3xl font-bold">My affiliate pipeline</h1><p className="mt-2 text-muted-foreground">Only customers attributed to your API key or manual affiliate entry are shown here.</p></div>
        <Button variant="outline" onClick={() => void load()} disabled={loading}><RefreshCw className={loading ? "h-4 w-4 animate-spin" : "h-4 w-4"} />Refresh</Button>
      </div>

      {error ? <div className="rounded-lg border border-destructive/40 bg-destructive/10 p-4 text-sm text-destructive">{error}</div> : null}
      {loading && !data ? <div className="flex min-h-64 items-center justify-center"><Loader2 className="h-6 w-6 animate-spin" /></div> : null}

      {data ? <>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <div className="rounded-xl border bg-card p-4"><p className="text-sm text-muted-foreground">Customers brought in</p><p className="mt-1 text-3xl font-bold">{data.metrics.leadCount}</p></div>
          <div className="rounded-xl border bg-card p-4"><p className="text-sm text-muted-foreground">Qualified value</p><p className="mt-1 text-3xl font-bold">{money(data.metrics.qualifiedTotal)}</p><p className="mt-1 text-xs text-muted-foreground">{data.metrics.qualifiedCount} qualified</p></div>
          <div className="rounded-xl border bg-card p-4"><p className="text-sm text-muted-foreground">Converted revenue</p><p className="mt-1 text-3xl font-bold">{money(data.metrics.convertedTotal)}</p><p className="mt-1 text-xs text-muted-foreground">{data.metrics.convertedCount} converted</p></div>
          <div className="rounded-xl border bg-card p-4"><p className="text-sm text-muted-foreground">Paid revenue</p><p className="mt-1 text-3xl font-bold text-emerald-700">{money(data.metrics.soldTotal)}</p><p className="mt-1 text-xs text-muted-foreground">{data.metrics.soldCount} sold</p></div>
        </div>

        <div className="overflow-x-auto rounded-xl border bg-card">
          <table className="min-w-[850px] w-full text-left text-sm">
            <thead className="bg-muted/70"><tr><th className="p-3">Customer</th><th className="p-3">Lead source</th><th className="p-3">Stage</th><th className="p-3">Added</th><th className="p-3 text-right">Qualified</th><th className="p-3 text-right">Converted</th><th className="p-3 text-right">Paid</th></tr></thead>
            <tbody>{data.rows.map((row) => <tr key={row.id} className="border-t"><td className="p-3"><div className="font-medium">{row.name}</div><div className="text-xs text-muted-foreground">{row.email || row.phone || [row.city, row.zip].filter(Boolean).join(" ") || "No contact details"}</div></td><td className="p-3">{row.pipelineLeadSource || "Affiliate"}</td><td className="p-3"><span className="rounded-full bg-primary/10 px-2 py-1 text-xs font-semibold text-primary">{row.pipelineStage}</span></td><td className="p-3">{date(row.createdAt)}</td><td className="p-3 text-right">{row.qualifiedValue == null ? "—" : money(row.qualifiedValue)}</td><td className="p-3 text-right">{row.convertedValue == null ? "—" : money(row.convertedValue)}</td><td className="p-3 text-right font-medium">{row.soldValue == null ? "—" : money(row.soldValue)}</td></tr>)}</tbody>
          </table>
          {!data.rows.length ? <div className="border-t p-10 text-center text-muted-foreground">No affiliate customers yet. Add one from Customer API setup or connect your system.</div> : null}
        </div>
      </> : null}
    </div>
  );
}
