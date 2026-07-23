"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowDown, ArrowUp, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import type { ChecklistItemType } from "@prisma/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

const textareaClassName =
  "flex min-h-[80px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm";
import { CHECKLIST_ITEM_TYPE_LABELS, CHECKLIST_ITEM_TYPES } from "@/lib/checklists/labels";
import type { ChecklistItemInput } from "@/lib/checklists/types";

type PriceBookOption = { id: string; name: string; type: string };

type EditorItem = ChecklistItemInput & { id?: string };

type FormState = {
  name: string;
  description: string;
  active: boolean;
  applyToAllJobs: boolean;
  divisions: ("INSTALL" | "SERVICE")[];
  excludeCallbacks: boolean;
  requiredForCompletion: boolean;
  customerVisible: boolean;
  priceBookItemIds: string[];
  items: EditorItem[];
};

const emptyItem = (): EditorItem => ({
  label: "",
  type: "PASS_FLAG_FAIL",
  required: false,
  options: null,
  config: null,
});

type Props = {
  templateId?: string;
};

export function ChecklistTemplateEditor({ templateId }: Props) {
  const router = useRouter();
  const isNew = !templateId;
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(!isNew);
  const [priceBookSearch, setPriceBookSearch] = useState("");
  const [priceBookResults, setPriceBookResults] = useState<PriceBookOption[]>([]);
  const [selectedPriceBook, setSelectedPriceBook] = useState<PriceBookOption[]>([]);
  const [form, setForm] = useState<FormState>({
    name: "",
    description: "",
    active: true,
    applyToAllJobs: false,
    divisions: [],
    excludeCallbacks: false,
    requiredForCompletion: false,
    customerVisible: false,
    priceBookItemIds: [],
    items: [emptyItem()],
  });

  const load = useCallback(async () => {
    if (!templateId) return;
    const res = await fetch(`/api/settings/checklists/${templateId}`);
    if (!res.ok) {
      toast.error("Failed to load checklist");
      router.push("/settings/checklists");
      return;
    }
    const data = await res.json();
    setForm({
      name: data.name,
      description: data.description ?? "",
      active: data.active,
      applyToAllJobs: data.applyToAllJobs,
      divisions: data.divisions ?? [],
      excludeCallbacks: data.excludeCallbacks,
      requiredForCompletion: data.requiredForCompletion,
      customerVisible: data.customerVisible ?? false,
      priceBookItemIds: data.priceBookItemIds ?? [],
      items: data.items?.length
        ? data.items.map((item: EditorItem) => ({
            id: item.id,
            label: item.label,
            helpText: item.helpText,
            type: item.type,
            required: item.required,
            sortOrder: item.sortOrder,
            options: item.options,
            config: item.config,
          }))
        : [emptyItem()],
    });
    setSelectedPriceBook(data.priceBookItems ?? []);
  }, [templateId, router]);

  useEffect(() => {
    if (!isNew) load().finally(() => setLoading(false));
  }, [isNew, load]);

  useEffect(() => {
    if (!priceBookSearch.trim()) {
      setPriceBookResults([]);
      return;
    }
    const timer = setTimeout(async () => {
      const res = await fetch(
        `/api/price-book/items?q=${encodeURIComponent(priceBookSearch)}&type=SERVICE&activeOnly=true`
      );
      if (res.ok) {
        const items = await res.json();
        setPriceBookResults(
          items.map((item: { id: string; name: string; type: string }) => ({
            id: item.id,
            name: item.name,
            type: item.type,
          }))
        );
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [priceBookSearch]);

  function updateItem(index: number, patch: Partial<EditorItem>) {
    setForm((prev) => {
      const items = [...prev.items];
      items[index] = { ...items[index], ...patch };
      return { ...prev, items };
    });
  }

  function moveItem(index: number, direction: -1 | 1) {
    const next = index + direction;
    if (next < 0 || next >= form.items.length) return;
    setForm((prev) => {
      const items = [...prev.items];
      [items[index], items[next]] = [items[next], items[index]];
      return { ...prev, items };
    });
  }

  function addPriceBookItem(item: PriceBookOption) {
    if (form.priceBookItemIds.includes(item.id)) return;
    setSelectedPriceBook((prev) => [...prev, item]);
    setForm((prev) => ({
      ...prev,
      priceBookItemIds: [...prev.priceBookItemIds, item.id],
    }));
    setPriceBookSearch("");
    setPriceBookResults([]);
  }

  function removePriceBookItem(id: string) {
    setSelectedPriceBook((prev) => prev.filter((p) => p.id !== id));
    setForm((prev) => ({
      ...prev,
      priceBookItemIds: prev.priceBookItemIds.filter((pid) => pid !== id),
    }));
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (!form.name.trim()) {
      toast.error("Name is required");
      return;
    }

    const payload = {
      ...form,
      items: form.items
        .filter((item) => item.label.trim())
        .map((item, index) => ({
          ...item,
          sortOrder: index,
          options:
            item.type === "MULTI_SELECT" || item.type === "SELECT_ONE"
              ? parseOptionsText(item)
              : null,
        })),
    };

    setSaving(true);
    try {
      const res = await fetch(
        isNew ? "/api/settings/checklists" : `/api/settings/checklists/${templateId}`,
        {
          method: isNew ? "POST" : "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        }
      );
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error ?? "Failed to save checklist");
        return;
      }
      toast.success(isNew ? "Checklist created" : "Checklist saved");
      router.push(`/settings/checklists/${data.id}`);
      router.refresh();
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return <p className="text-sm text-muted-foreground">Loading checklist…</p>;
  }

  return (
    <form onSubmit={handleSave} className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Details</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <label htmlFor="name" className="text-sm font-medium">
              Name
            </label>
            <Input
              id="name"
              value={form.name}
              onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))}
              required
            />
          </div>
          <div className="space-y-2">
            <label htmlFor="description" className="text-sm font-medium">
              Description
            </label>
            <textarea
              id="description"
              className={textareaClassName}
              value={form.description}
              onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) =>
                setForm((p) => ({ ...p, description: e.target.value }))
              }
              rows={2}
            />
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={form.active}
              onChange={(e) => setForm((p) => ({ ...p, active: e.target.checked }))}
            />
            Active
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={form.customerVisible}
              onChange={(e) =>
                setForm((p) => ({ ...p, customerVisible: e.target.checked }))
              }
            />
            Visible in customer portal (when completed)
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={form.requiredForCompletion}
              onChange={(e) =>
                setForm((p) => ({ ...p, requiredForCompletion: e.target.checked }))
              }
            />
            Mandatory for visit completion
          </label>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">When to apply</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={form.applyToAllJobs}
              onChange={(e) =>
                setForm((p) => ({
                  ...p,
                  applyToAllJobs: e.target.checked,
                  divisions: e.target.checked ? [] : p.divisions,
                }))
              }
            />
            Apply to all visits
          </label>
          {!form.applyToAllJobs && (
            <div className="flex flex-wrap gap-4">
              {(["INSTALL", "SERVICE"] as const).map((division) => (
                <label key={division} className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={form.divisions.includes(division)}
                    onChange={(e) =>
                      setForm((p) => ({
                        ...p,
                        divisions: e.target.checked
                          ? [...p.divisions, division]
                          : p.divisions.filter((d) => d !== division),
                      }))
                    }
                  />
                  {division === "INSTALL" ? "Install" : "Service"}
                </label>
              ))}
            </div>
          )}
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={form.excludeCallbacks}
              onChange={(e) => setForm((p) => ({ ...p, excludeCallbacks: e.target.checked }))}
            />
            Exclude callback visits
          </label>
          <div className="space-y-2">
            <label className="text-sm font-medium">Also apply when these line items are on the visit</label>
            <Input
              placeholder="Search price book services…"
              value={priceBookSearch}
              onChange={(e) => setPriceBookSearch(e.target.value)}
            />
            {priceBookResults.length > 0 && (
              <div className="rounded-md border bg-card">
                {priceBookResults.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    className="block w-full px-3 py-2 text-left text-sm hover:bg-muted"
                    onClick={() => addPriceBookItem(item)}
                  >
                    {item.name}
                  </button>
                ))}
              </div>
            )}
            {selectedPriceBook.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {selectedPriceBook.map((item) => (
                  <span
                    key={item.id}
                    className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-1 text-xs"
                  >
                    {item.name}
                    <button type="button" onClick={() => removePriceBookItem(item.id)}>
                      ×
                    </button>
                  </span>
                ))}
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-base">Checklist items</CardTitle>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setForm((p) => ({ ...p, items: [...p.items, emptyItem()] }))}
          >
            <Plus className="mr-1 h-3.5 w-3.5" />
            Add item
          </Button>
        </CardHeader>
        <CardContent className="space-y-4">
          {form.items.map((item, index) => (
            <div key={index} className="rounded-lg border p-4 space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-sm font-medium">Item {index + 1}</span>
                <div className="flex gap-1">
                  <Button type="button" variant="ghost" size="icon" onClick={() => moveItem(index, -1)}>
                    <ArrowUp className="h-4 w-4" />
                  </Button>
                  <Button type="button" variant="ghost" size="icon" onClick={() => moveItem(index, 1)}>
                    <ArrowDown className="h-4 w-4" />
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    onClick={() =>
                      setForm((p) => ({
                        ...p,
                        items: p.items.filter((_, i) => i !== index),
                      }))
                    }
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
              <Input
                placeholder="Label"
                value={item.label}
                onChange={(e) => updateItem(index, { label: e.target.value })}
              />
              <Input
                placeholder="Help text (optional)"
                value={item.helpText ?? ""}
                onChange={(e) => updateItem(index, { helpText: e.target.value })}
              />
              <select
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                value={item.type}
                onChange={(e) =>
                  updateItem(index, { type: e.target.value as ChecklistItemType })
                }
              >
                {CHECKLIST_ITEM_TYPES.map((type) => (
                  <option key={type} value={type}>
                    {CHECKLIST_ITEM_TYPE_LABELS[type]}
                  </option>
                ))}
              </select>
              {(item.type === "MULTI_SELECT" || item.type === "SELECT_ONE") && (
                <textarea
                  className={textareaClassName}
                  placeholder="Options (one per line)"
                  value={optionsToText(item.options)}
                  onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) =>
                    updateItem(index, {
                      options: e.target.value
                        .split("\n")
                        .map((line: string) => line.trim())
                        .filter(Boolean)
                        .map((line: string) => ({ value: line, label: line })),
                    })
                  }
                  rows={3}
                />
              )}
              {item.type === "NUMBER" && (
                <div className="grid grid-cols-2 gap-2">
                  <Input
                    type="number"
                    placeholder="Min"
                    value={item.config?.min ?? ""}
                    onChange={(e) =>
                      updateItem(index, {
                        config: {
                          ...item.config,
                          min: e.target.value ? Number(e.target.value) : undefined,
                        },
                      })
                    }
                  />
                  <Input
                    type="number"
                    placeholder="Max"
                    value={item.config?.max ?? ""}
                    onChange={(e) =>
                      updateItem(index, {
                        config: {
                          ...item.config,
                          max: e.target.value ? Number(e.target.value) : undefined,
                        },
                      })
                    }
                  />
                </div>
              )}
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={item.required ?? false}
                  onChange={(e) => updateItem(index, { required: e.target.checked })}
                />
                Required item
              </label>
            </div>
          ))}
        </CardContent>
      </Card>

      <div className="flex gap-2">
        <Button type="submit" disabled={saving}>
          {saving ? "Saving…" : isNew ? "Create checklist" : "Save changes"}
        </Button>
        <Button type="button" variant="outline" onClick={() => router.push("/settings/checklists")}>
          Cancel
        </Button>
      </div>
    </form>
  );
}

function optionsToText(options: unknown): string {
  if (!Array.isArray(options)) return "";
  return options
    .map((o) => {
      if (typeof o !== "object" || !o) return "";
      return String((o as { label?: string; value?: string }).label ?? (o as { value?: string }).value ?? "");
    })
    .filter(Boolean)
    .join("\n");
}

function parseOptionsText(item: EditorItem) {
  if (Array.isArray(item.options) && item.options.length) return item.options;
  return [];
}
