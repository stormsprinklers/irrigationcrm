"use client";

import { useEffect, useMemo, useState } from "react";
import { Sparkles, Upload } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import type { LaborRateDTO, PriceBookItemDTO } from "@/lib/price-book/types";
import { blobProxyUrl } from "@/lib/blob/urls";

type MaterialOption = {
  id: string;
  name: string;
  sku: string | null;
  unitPrice: number;
  unitCost?: number | null;
};

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
  laborRateId: "",
  laborHours: "",
  trackMaterials: false,
  pricingMode: "CALCULATED" as "MANUAL" | "CALCULATED",
  imageUrl: "",
};

function formatCurrency(value: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(value);
}

export function PriceBookItemDialog({ open, type, categoryId, item, onClose, onSaved }: Props) {
  const [form, setForm] = useState(emptyForm);
  const [materials, setMaterials] = useState<MaterialOption[]>([]);
  const [laborRates, setLaborRates] = useState<LaborRateDTO[]>([]);
  const [flatRateEnabled, setFlatRateEnabled] = useState(false);
  const [selectedMaterials, setSelectedMaterials] = useState<Array<{ materialItemId: string; quantity: string }>>(
    []
  );
  const [saving, setSaving] = useState(false);
  const [generatingDesc, setGeneratingDesc] = useState(false);
  const [generatingImage, setGeneratingImage] = useState(false);
  const [uploadingImage, setUploadingImage] = useState(false);

  useEffect(() => {
    if (!open) return;
    fetch("/api/settings/price-book")
      .then((r) => r.json())
      .then((data) => setFlatRateEnabled(Boolean(data.flatRatePricingEnabled)))
      .catch(() => setFlatRateEnabled(false));
    fetch("/api/settings/price-book/labor-rates")
      .then((r) => r.json())
      .then(setLaborRates)
      .catch(() => setLaborRates([]));
  }, [open]);

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
        laborRateId: item.laborRateId ?? item.laborRatePreset?.id ?? "",
        laborHours: item.laborHours != null ? String(item.laborHours) : "",
        trackMaterials: item.trackMaterials,
        pricingMode: item.pricingMode,
        imageUrl: item.imageUrl ?? "",
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
      .then(setMaterials)
      .catch(() => setMaterials([]));
  }, [open, type]);

  const breakdown = item?.priceBreakdown;

  const computedTotal = useMemo(() => {
    if (type !== "SERVICE" || form.pricingMode !== "CALCULATED") return null;
    return breakdown?.total ?? null;
  }, [type, form.pricingMode, breakdown?.total]);

  if (!open) return null;

  async function handleGenerateDescription() {
    if (!form.name.trim()) {
      toast.error("Enter a name first");
      return;
    }
    setGeneratingDesc(true);
    try {
      const res = await fetch("/api/price-book/items/generate-description", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: form.name.trim(), type }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed");
      setForm((p) => ({ ...p, description: data.description ?? "" }));
      toast.success("Description generated");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to generate description");
    } finally {
      setGeneratingDesc(false);
    }
  }

  async function handleUploadImage(file: File) {
    setUploadingImage(true);
    try {
      const body = new FormData();
      body.append("file", file);
      const res = await fetch("/api/upload/price-book-image", { method: "POST", body });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Upload failed");
      setForm((p) => ({ ...p, imageUrl: data.url }));
      toast.success("Image uploaded");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setUploadingImage(false);
    }
  }

  async function handleGenerateImage() {
    if (!item?.id) {
      toast.error("Save the item first, then generate an image");
      return;
    }
    setGeneratingImage(true);
    try {
      const res = await fetch(`/api/price-book/items/${item.id}/generate-image`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed");
      setForm((p) => ({ ...p, imageUrl: data.imageUrl ?? "" }));
      toast.success("Image generated");
      onSaved();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to generate image");
    } finally {
      setGeneratingImage(false);
    }
  }

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
        imageUrl: form.imageUrl || null,
        unitPrice: Number(form.unitPrice || 0),
        unitCost: form.unitCost ? Number(form.unitCost) : null,
        unit: form.unit || "each",
        taxable: form.taxable,
        markupEnabled: form.markupEnabled,
        laborRateId: type === "SERVICE" && form.laborRateId ? form.laborRateId : null,
        laborHours: type === "SERVICE" && form.laborHours ? Number(form.laborHours) : null,
        pricingMode: type === "SERVICE" ? form.pricingMode : "MANUAL",
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

  const priceReadOnly = type === "SERVICE" && flatRateEnabled && form.pricingMode === "CALCULATED";

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 p-4">
      <div className="max-h-[90vh] w-full max-w-xl overflow-y-auto rounded-lg border bg-background p-6 shadow-lg">
        <h2 className="text-lg font-semibold">
          {item ? "Edit" : "Add"} {type === "SERVICE" ? "service" : "material"}
        </h2>
        <form onSubmit={handleSubmit} className="mt-4 space-y-3">
          <div>
            <label className="mb-1 block text-sm font-medium">Name</label>
            <Input value={form.name} onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))} required />
          </div>
          <div>
            <div className="mb-1 flex items-center justify-between">
              <label className="text-sm font-medium">Description</label>
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={generatingDesc}
                onClick={() => void handleGenerateDescription()}
              >
                <Sparkles className="mr-1 h-3 w-3" />
                Generate
              </Button>
            </div>
            <Input
              value={form.description}
              onChange={(e) => setForm((p) => ({ ...p, description: e.target.value }))}
            />
          </div>

          <div className="rounded-md border p-3">
            <p className="mb-2 text-sm font-medium">Photo</p>
            {form.imageUrl ? (
              <img
                src={blobProxyUrl(form.imageUrl)}
                alt={form.name}
                className="mb-2 h-24 w-24 rounded-md border object-cover"
              />
            ) : null}
            <div className="flex flex-wrap gap-2">
              <label className="cursor-pointer">
                <input
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) void handleUploadImage(file);
                  }}
                />
                <span className="inline-flex h-9 items-center rounded-md border border-input bg-background px-3 text-sm hover:bg-muted">
                  <Upload className="mr-1 h-3 w-3" />
                  {uploadingImage ? "Uploading..." : "Upload"}
                </span>
              </label>
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={generatingImage || !item?.id}
                onClick={() => void handleGenerateImage()}
              >
                <Sparkles className="mr-1 h-3 w-3" />
                AI image
              </Button>
            </div>
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
              <label className="mb-1 block text-sm font-medium">
                Price {priceReadOnly ? "(calculated)" : ""}
              </label>
              <Input
                type="number"
                min="0"
                step="0.01"
                value={priceReadOnly && computedTotal != null ? String(computedTotal) : form.unitPrice}
                readOnly={priceReadOnly}
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
              Use material markups (tier pricing from cost)
            </label>
          )}

          {type === "SERVICE" && flatRateEnabled && (
            <>
              <label className="flex items-center gap-2 text-sm">
                <Checkbox
                  checked={form.pricingMode === "MANUAL"}
                  onCheckedChange={(c) =>
                    setForm((p) => ({ ...p, pricingMode: c ? "MANUAL" : "CALCULATED" }))
                  }
                />
                Manual price override
              </label>
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <label className="mb-1 block text-sm font-medium">Labor rate</label>
                  <select
                    className="flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                    value={form.laborRateId}
                    onChange={(e) => setForm((p) => ({ ...p, laborRateId: e.target.value }))}
                  >
                    <option value="">Select rate</option>
                    {laborRates.map((rate) => (
                      <option key={rate.id} value={rate.id}>
                        {rate.name} (${rate.hourlyPrice}/hr)
                        {rate.isDefault ? " · default" : ""}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="mb-1 block text-sm font-medium">Estimated hours</label>
                  <Input
                    type="number"
                    min="0"
                    step="0.25"
                    value={form.laborHours}
                    onChange={(e) => setForm((p) => ({ ...p, laborHours: e.target.value }))}
                  />
                </div>
              </div>
              {breakdown && form.pricingMode === "CALCULATED" && (
                <div className="rounded-md border bg-muted/30 p-3 text-sm">
                  <p className="mb-2 font-medium">Price breakdown</p>
                  <ul className="space-y-1 text-muted-foreground">
                    {breakdown.lines.map((line, i) => (
                      <li key={i} className="flex justify-between">
                        <span>{line.label}</span>
                        <span>{formatCurrency(line.amount)}</span>
                      </li>
                    ))}
                  </ul>
                  <p className="mt-2 flex justify-between font-medium text-foreground">
                    <span>Flat rate total</span>
                    <span>{formatCurrency(breakdown.total)}</span>
                  </p>
                </div>
              )}
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

          {type === "SERVICE" && !flatRateEnabled && (
            <p className="text-sm text-muted-foreground">
              Enable flat rate pricing in Settings → Price Book to use labor rates and calculated prices.
            </p>
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
