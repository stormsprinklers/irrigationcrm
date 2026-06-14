"use client";

import { useEffect, useState } from "react";
import { Plus } from "lucide-react";
import { toast } from "sonner";
import { ContentArea } from "@/components/layout/ContentArea";
import { PageHeader } from "@/components/layout/PageHeader";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export default function PriceBookDiscountsPage() {
  const [discounts, setDiscounts] = useState<
    Array<{ id: string; name: string; code: string | null; type: string; amount: number; active: boolean; appliesTo: string }>
  >([]);
  const [form, setForm] = useState({ name: "", code: "", amount: "10", type: "PERCENT" });
  const [loading, setLoading] = useState(true);

  function load() {
    fetch("/api/price-book/discounts")
      .then((r) => r.json())
      .then((d) => setDiscounts(d.discounts ?? []))
      .finally(() => setLoading(false));
  }

  useEffect(() => { load(); }, []);

  async function createDiscount() {
    const res = await fetch("/api/price-book/discounts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...form, amount: Number(form.amount) }),
    });
    if (!res.ok) { toast.error("Failed to create discount"); return; }
    setForm({ name: "", code: "", amount: "10", type: "PERCENT" });
    load();
    toast.success("Discount created");
  }

  async function toggleActive(id: string, active: boolean) {
    await fetch(`/api/price-book/discounts/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ active: !active }),
    });
    load();
  }

  return (
    <ContentArea>
      <PageHeader breadcrumb={["Price book", "Discounts"]} title="Discounts" />
      <div className="mb-4 flex flex-wrap gap-2 rounded-lg border border-border bg-white p-4">
        <Input placeholder="Name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="max-w-[180px]" />
        <Input placeholder="Code (optional)" value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} className="max-w-[140px]" />
        <Input placeholder="Amount" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} className="max-w-[100px]" />
        <select className="h-9 rounded-md border px-2 text-sm" value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })}>
          <option value="PERCENT">Percent</option>
          <option value="FIXED">Fixed</option>
        </select>
        <Button size="sm" onClick={createDiscount}><Plus className="h-4 w-4" />Add</Button>
      </div>
      {loading ? <p className="text-sm text-muted-foreground">Loading...</p> : (
        <div className="rounded-lg border border-border bg-white">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Code</TableHead>
                <TableHead>Amount</TableHead>
                <TableHead>Applies to</TableHead>
                <TableHead>Status</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {discounts.map((d) => (
                <TableRow key={d.id}>
                  <TableCell>{d.name}</TableCell>
                  <TableCell>{d.code ?? "—"}</TableCell>
                  <TableCell>{d.type === "PERCENT" ? `${d.amount}%` : `$${d.amount}`}</TableCell>
                  <TableCell>{d.appliesTo}</TableCell>
                  <TableCell><Badge variant={d.active ? "default" : "outline"}>{d.active ? "Active" : "Inactive"}</Badge></TableCell>
                  <TableCell>
                    <Button variant="outline" size="sm" onClick={() => toggleActive(d.id, d.active)}>
                      {d.active ? "Deactivate" : "Activate"}
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </ContentArea>
  );
}
