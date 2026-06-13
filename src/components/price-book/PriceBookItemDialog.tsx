"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import type { PriceBookItemDTO } from "@/lib/price-book/types";

type MaterialOption = { id: string; name: string; sku: string | null; unitPrice: number };

type Props = {
  open: boolean;
  type: "SERVICE" | "MATERIAL";
  categoryId: string;
  item?: PriceBookItemDTO | null;
  onClose: () => void;
  onSaved: () => void;
};

const emptyForm = {
  name: "",
  description: "",
  sku: "",
  unitPrice: "0",
  unitCost: "",
  unit: "each",
  taxable: false,
  markupEnabled: false,
  laborRate: "",
  laborHours: "",
  trackMaterials: false,
};

export function PriceBookItemDialog({ open, type, categoryId, item, onClose, onSaved }: Props) {
  const [form, setForm] = useState(emptyForm);
  const [materials, setMaterials] = useState<MaterialOption[]>([]);
  const [selectedMaterials, setSelectedMaterials] = useState<Array<{ materialItemId: string; quantity: string }>>(
    []
  );
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    if (item) {
      setForm({
        name: item.name,
        description: item.description ?? "",
        sku: item.sku ?? "",
        unitPrice: String(item.unitPrice),
        unitCost: item.unitCost != null ? String(item.unitCost) : "",
        unit: item.unit,
        taxable: item.taxable,
        markupEnabled: item.markupEnabled,
        laborRate: item.laborRate != null ? String(item.laborRate) : "",
        laborHours: item.laborHours != null ? String(item.laborHours) : "",
        trackMaterials: item.trackMaterials,
      });
      setSelectedMaterials(
        (item.materials ?? []).map((m) => ({
          materialItemId: m.materialItemId,
          quantity: String(m.quantity),
        }))
      );
    } else {
      setForm(emptyForm);
      setSelectedMaterials([]);
    }
  }, [open, item]);

  useEffect(() => {
    if (!open || type !== "SERVICE") return;
    fetch("/api/price-book/items?type=MATERIAL")
      .then((r) => r.json())
      .then((data) => setMaterials(data))
      .catch(() => setMaterials([]));
  }, [open, type]);

  if (!open) return null;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.name.trim()) return;

    setSaving(true);
    try {
      const payload = {
        categoryId,
        type,
        name: form.name.trim(),
        description: form.description || null,
        sku: form.sku || null,
        unitPrice: Number(form.unitPrice || 0),
        unitCost: form.unitCost ? Number(form.unitCost) : null,
        unit: form.unit || "each",
        taxable: form.taxable,
        markupEnabled: form.markupEnabled,
        laborRate: type === "SERVICE" && form.laborRate ? Number(form.laborRate) : null,
        laborHours: type === "SERVICE" && form.laborHours ? Number(form.laborHours) : null,
        trackMaterials: type === "SERVICE" ? form.trackMaterials : false,
        materials:
          type === "SERVICE"
            ? selectedMaterials
                .filter((m) => m.materialItemId)
                .map((m) => ({
                  materialItemId: m.materialItemId,
                  quantity: Number(m.quantity || 1),
                }))
            : undefined,
      };

      const url = item ? `/api/price-book/items/${item.id}` : "/api/price-book/items";
      const method = item ? "PATCH" : "POST";
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        toast.error(err.error ?? "Failed to save item");
        return;
      }

      toast.success(item ? "Item updated" : "Item created");
      onSaved();
      onClose();
    } finally {
      setSaving(false);
    }
  }

  function addMaterialRow() {
    setSelectedMaterials((prev) => [...prev, { materialItemId: "", quantity: "1" }]);
  }

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 p-4">
      <div className="max-h-[90vh] w-full max-w-xl overflow-y-auto rounded-lg border bg-background p-6 shadow-lg">
        <h2 className="text-lg font-semibold">{item ? "Edit" : "Add"} {type === "SERVICE" ? "service" : "material"}</h2>
        <form onSubmit={handleSubmit} className="mt-4 space-y-3">
          <div>
            <label className="mb-1 block text-sm font-medium">Name</label>
            <Input value={form.name} onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))} required />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium">Description</label>
            <Input
              value={form.description}
              onChange={(e) => setForm((p) => ({ ...p, description: e.target.value }))}
            />
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-sm font-medium">SKU (optional)</label>
              <Input value={form.sku} onChange={(e) => setForm((p) => ({ ...p, sku: e.target.value }))} />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium">Unit of measure</label>
              <Input value={form.unit} onChange={(e) => setForm((p) => ({ ...p, unit: e.target.value }))} />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium">Price</label>
              <Input
                type="number"
                min="0"
                step="0.01"
                value={form.unitPrice}
                onChange={(e) => setForm((p) => ({ ...p, unitPrice: e.target.value }))}
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium">Cost</label>
              <Input
                type="number"
                min="0"
                step="0.01"
                value={form.unitCost}
                onChange={(e) => setForm((p) => ({ ...p, unitCost: e.target.value }))}
              />
            </div>
          </div>

          <label className="flex items-center gap-2 text-sm">
            <Checkbox checked={form.taxable} onCheckedChange={(c) => setForm((p) => ({ ...p, taxable: Boolean(c) }))} />
            Taxable
          </label>

          {type === "MATERIAL" && (
            <label className="flex items-center gap-2 text-sm">
              <Checkbox
                checked={form.markupEnabled}
                onCheckedChange={(c) => setForm((p) => ({ ...p, markupEnabled: Boolean(c) }))}
              />
              Material markup enabled
            </label>
          )}

          {type === "SERVICE" && (
            <>
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <label className="mb-1 block text-sm font-medium">Labor rate ($/hr)</label>
                  <Input
                    type="number"
                    min="0"
                    step="0.01"
                    value={form.laborRate}
                    onChange={(e) => setForm((p) => ({ ...p, laborRate: e.target.value }))}
                  />
                </div>
                <div>
                  <label className="mb-1 block text-sm font-medium">Labor hours</label>
                  <Input
                    type="number"
                    min="0"
                    step="0.25"
                    value={form.laborHours}
                    onChange={(e) => setForm((p) => ({ ...p, laborHours: e.target.value }))}
                  />
                </div>
              </div>
              <label className="flex items-center gap-2 text-sm">
                <Checkbox
                  checked={form.trackMaterials}
                  onCheckedChange={(c) => setForm((p) => ({ ...p, trackMaterials: Boolean(c) }))}
                />
                Track bundled materials on jobs
              </label>
              <div className="space-y-2 rounded-md border p-3">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-medium">Included materials</p>
                  <Button type="button" size="sm" variant="outline" onClick={addMaterialRow}>
                    Add material
                  </Button>
                </div>
                {selectedMaterials.map((row, index) => (
                  <div key={index} className="grid grid-cols-[1fr_80px] gap-2">
                    <select
                      className="h-9 rounded-md border border-input bg-transparent px-2 text-sm"
                      value={row.materialItemId}
                      onChange={(e) =>
                        setSelectedMaterials((prev) =>
                          prev.map((item, i) =>
                            i === index ? { ...item, materialItemId: e.target.value } : item
                          )
                        )
                      }
                    >
                      <option value="">Select material</option>
                      {materials.map((material) => (
                        <option key={material.id} value={material.id}>
                          {material.name}
                          {material.sku ? ` (${material.sku})` : ""}
                        </option>
                      ))}
                    </select>
                    <Input
                      type="number"
                      min="0"
                      step="0.001"
                      value={row.quantity}
                      onChange={(e) =>
                        setSelectedMaterials((prev) =>
                          prev.map((item, i) => (i === index ? { ...item, quantity: e.target.value } : item))
                        )
                      }
                    />
                  </div>
                ))}
              </div>
            </>
          )}

          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={onClose} disabled={saving}>
              Cancel
            </Button>
            <Button type="submit" disabled={saving}>
              {saving ? "Saving..." : item ? "Save changes" : "Create item"}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
