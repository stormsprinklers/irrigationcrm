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
import type { PricingFormField } from "@/lib/price-book/extras";

export default function PricingFormsPage() {
  const [forms, setForms] = useState<
    Array<{ id: string; name: string; description: string | null; fields: PricingFormField[] }>
  >([]);
  const [name, setName] = useState("");
  const [loading, setLoading] = useState(true);

  function load() {
    fetch("/api/price-book/pricing-forms")
      .then((r) => r.json())
      .then((d) => setForms(d.forms ?? []))
      .finally(() => setLoading(false));
  }

  useEffect(() => { load(); }, []);

  async function createForm() {
    if (!name.trim()) return;
    const fields: PricingFormField[] = [
      { id: "zones", label: "Number of zones", type: "number", mapsToItemName: "Zone service", mapsToPrice: 45 },
      { id: "service", label: "Service type", type: "select", options: ["Repair", "Install"], mapsToItemName: "Service call", mapsToPrice: 89 },
    ];
    const res = await fetch("/api/price-book/pricing-forms", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, fields }),
    });
    if (!res.ok) { toast.error("Failed to create form"); return; }
    setName(""); load();
    toast.success("Pricing form created");
  }

  return (
    <ContentArea>
      <PageHeader breadcrumb={["Price book", "Pricing forms"]} title="Pricing forms" />
      <div className="mb-4 flex gap-2 rounded-lg border border-border bg-white p-4">
        <Input placeholder="Form name" value={name} onChange={(e) => setName(e.target.value)} className="max-w-[240px]" />
        <Button size="sm" onClick={createForm}><Plus className="h-4 w-4" />Add form</Button>
      </div>
      {loading ? <p className="text-sm text-muted-foreground">Loading...</p> : (
        <div className="rounded-lg border border-border bg-white">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Fields</TableHead>
                <TableHead>Description</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {forms.map((f) => (
                <TableRow key={f.id}>
                  <TableCell className="font-medium">{f.name}</TableCell>
                  <TableCell>{Array.isArray(f.fields) ? f.fields.length : 0} fields</TableCell>
                  <TableCell>{f.description ?? "—"}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </ContentArea>
  );
}
