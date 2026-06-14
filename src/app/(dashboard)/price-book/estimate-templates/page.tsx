"use client";

import { useEffect, useState } from "react";
import { Plus } from "lucide-react";
import { toast } from "sonner";
import { ContentArea } from "@/components/layout/ContentArea";
import { PageHeader } from "@/components/layout/PageHeader";
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

export default function EstimateTemplatesPage() {
  const [templates, setTemplates] = useState<
    Array<{ id: string; name: string; description: string | null; lineItems: Array<{ name: string; unitPrice: number }> }>
  >([]);
  const [name, setName] = useState("");
  const [itemName, setItemName] = useState("");
  const [itemPrice, setItemPrice] = useState("89");
  const [loading, setLoading] = useState(true);

  function load() {
    fetch("/api/price-book/estimate-templates")
      .then((r) => r.json())
      .then((d) => setTemplates(d.templates ?? []))
      .finally(() => setLoading(false));
  }

  useEffect(() => { load(); }, []);

  async function createTemplate() {
    if (!name.trim()) return;
    const res = await fetch("/api/price-book/estimate-templates", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name,
        lineItems: itemName ? [{ name: itemName, unitPrice: Number(itemPrice), quantity: 1 }] : [],
      }),
    });
    if (!res.ok) { toast.error("Failed to create template"); return; }
    setName(""); setItemName(""); load();
    toast.success("Template created");
  }

  return (
    <ContentArea>
      <PageHeader breadcrumb={["Price book", "Estimate Templates"]} title="Estimate Templates" />
      <div className="mb-4 flex flex-wrap gap-2 rounded-lg border border-border bg-white p-4">
        <Input placeholder="Template name" value={name} onChange={(e) => setName(e.target.value)} className="max-w-[200px]" />
        <Input placeholder="Line item name" value={itemName} onChange={(e) => setItemName(e.target.value)} className="max-w-[200px]" />
        <Input placeholder="Price" value={itemPrice} onChange={(e) => setItemPrice(e.target.value)} className="max-w-[100px]" />
        <Button size="sm" onClick={createTemplate}><Plus className="h-4 w-4" />Add template</Button>
      </div>
      {loading ? <p className="text-sm text-muted-foreground">Loading...</p> : (
        <div className="rounded-lg border border-border bg-white">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Line items</TableHead>
                <TableHead>Sample total</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {templates.map((t) => {
                const total = t.lineItems.reduce((s, i) => s + i.unitPrice, 0);
                return (
                  <TableRow key={t.id}>
                    <TableCell className="font-medium">{t.name}</TableCell>
                    <TableCell>{t.lineItems.map((i) => i.name).join(", ") || "—"}</TableCell>
                    <TableCell>${total.toFixed(2)}</TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}
    </ContentArea>
  );
}
