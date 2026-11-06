"use client";

import { useCallback, useEffect, useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type CostItem = { id: string; name: string; quantity: number; unitCost: number; total: number };
type LaborEntry = { userId: string; name: string; hours: number; hourlyRate: number | null; cost: number | null };
type JobCosts = {
  items: CostItem[];
  materialCost: number;
  labor: LaborEntry[];
  laborCost: number | null;
  totalCost: number | null;
  showRates: boolean;
};

function money(value: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(value);
}

export function VisitJobCostSection({ visitId }: { visitId: string }) {
  const [data, setData] = useState<JobCosts | null>(null);
  const [items, setItems] = useState<CostItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch(`/api/visits/${visitId}/job-costs`);
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? "Could not load job costs");
      setData(body);
      setItems(body.items ?? []);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not load job costs");
    } finally {
      setLoading(false);
    }
  }, [visitId]);

  useEffect(() => { void load(); }, [load]);

  function patchItem(id: string, patch: Partial<CostItem>) {
    setItems((current) => current.map((item) => item.id === id ? { ...item, ...patch } : item));
  }

  async function save() {
    setSaving(true);
    try {
      const response = await fetch(`/api/visits/${visitId}/job-costs`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ items }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? "Could not save job costs");
      toast.success("Job material costs saved");
      window.dispatchEvent(new Event("visit-job-costs-updated"));
      await load();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not save job costs");
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <div className="rounded-lg border bg-white p-4 text-sm text-muted-foreground">Loading job costs…</div>;
  if (!data) return null;
  const materialTotal = items.reduce((sum, item) => sum + Number(item.quantity) * Number(item.unitCost), 0);

  return <section className="rounded-lg border bg-white p-4">
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div>
        <h3 className="text-sm font-semibold">Holiday lighting job costs</h3>
        <p className="mt-1 text-xs text-muted-foreground">Internal contractor material costs and working time tracked separately for each technician.</p>
      </div>
      <Button type="button" size="sm" variant="outline" onClick={() => setItems((current) => [...current, { id: `cost-${crypto.randomUUID()}`, name: "", quantity: 1, unitCost: 0, total: 0 }])}>
        <Plus className="h-3.5 w-3.5" /> Add cost item
      </Button>
    </div>
    <div className="mt-4 space-y-2">
      {items.length ? items.map((item) => <div key={item.id} className="grid gap-2 rounded-md border p-2 sm:grid-cols-[minmax(150px,1fr)_90px_120px_100px_36px] sm:items-center">
        <Input value={item.name} placeholder="Material" onChange={(event) => patchItem(item.id, { name: event.target.value })} />
        <Input type="number" min={0.001} step="0.001" value={item.quantity} onChange={(event) => event.target.value !== "" && patchItem(item.id, { quantity: Number(event.target.value) })} />
        <Input type="number" min={0} step="0.01" value={item.unitCost} onChange={(event) => event.target.value !== "" && patchItem(item.id, { unitCost: Number(event.target.value) })} />
        <span className="text-right text-sm font-medium">{money(item.quantity * item.unitCost)}</span>
        <Button type="button" size="icon" variant="ghost" aria-label={`Remove ${item.name || "cost item"}`} onClick={() => setItems((current) => current.filter((entry) => entry.id !== item.id))}><Trash2 className="h-4 w-4" /></Button>
      </div>) : <p className="text-sm text-muted-foreground">No contractor material costs are attached yet.</p>}
      <div className="flex items-center justify-between border-t pt-3 text-sm"><span className="font-medium">Material cost</span><span className="font-semibold">{money(materialTotal)}</span></div>
      <Button type="button" size="sm" disabled={saving} onClick={() => void save()}>{saving ? "Saving…" : "Save material costs"}</Button>
    </div>
    <div className="mt-5 border-t pt-4">
      <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Technician working time</h4>
      {data.labor.length ? <div className="mt-2 space-y-2 text-sm">{data.labor.map((entry) => <div key={entry.userId} className="flex items-center justify-between gap-3"><span>{entry.name}</span><span>{entry.hours.toFixed(2)} hr{data.showRates && entry.hourlyRate != null && entry.cost != null ? ` × ${money(entry.hourlyRate)}/hr = ${money(entry.cost)}` : ""}</span></div>)}</div> : <p className="mt-2 text-sm text-muted-foreground">No working time has been recorded for this visit.</p>}
      {data.showRates && data.laborCost != null ? <div className="mt-3 flex items-center justify-between border-t pt-3 text-sm"><span className="font-medium">Labor cost</span><span className="font-semibold">{money(data.laborCost)}</span></div> : null}
    </div>
  </section>;
}
