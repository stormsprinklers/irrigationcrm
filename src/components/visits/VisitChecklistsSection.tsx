"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import type { ChecklistItemType } from "@prisma/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { CHECKLIST_ITEM_TYPE_LABELS } from "@/lib/checklists/labels";

const textareaClassName =
  "flex min-h-[80px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm";

type ChecklistItem = {
  id: string;
  label: string;
  helpText: string | null;
  type: ChecklistItemType;
  required: boolean;
  sortOrder: number;
  options: unknown;
  config: unknown;
  response: unknown;
  completedAt: string | null;
};

type VisitChecklist = {
  id: string;
  name: string;
  requiredForCompletion: boolean;
  status: string;
  progress: { requiredComplete: number; requiredTotal: number; itemCount: number };
  items: ChecklistItem[];
};

type Props = {
  visitId: string;
  onUpdated?: () => Promise<void>;
};

export function VisitChecklistsSection({ visitId, onUpdated }: Props) {
  const [checklists, setChecklists] = useState<VisitChecklist[]>([]);
  const [mergeVisitChecklists, setMergeVisitChecklists] = useState(false);
  const [loading, setLoading] = useState(true);
  const [savingItemId, setSavingItemId] = useState<string | null>(null);

  const load = useCallback(async () => {
    const res = await fetch(`/api/visits/${visitId}/checklists`);
    if (!res.ok) return;
    const data = await res.json();
    if (Array.isArray(data)) {
      setChecklists(data);
      setMergeVisitChecklists(false);
      return;
    }
    setChecklists(data.checklists ?? []);
    setMergeVisitChecklists(Boolean(data.mergeVisitChecklists));
  }, [visitId]);

  useEffect(() => {
    load().finally(() => setLoading(false));
  }, [load]);

  async function saveItem(checklistId: string, itemId: string, response: unknown) {
    setSavingItemId(itemId);
    try {
      const res = await fetch(
        `/api/visits/${visitId}/checklists/${checklistId}/items/${itemId}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ response }),
        }
      );
      if (!res.ok) {
        const data = await res.json();
        toast.error(data.error ?? "Failed to save response");
        return;
      }
      await load();
      await onUpdated?.();
    } finally {
      setSavingItemId(null);
    }
  }

  async function completeChecklist(checklistId: string) {
    const res = await fetch(`/api/visits/${visitId}/checklists/${checklistId}/complete`, {
      method: "POST",
    });
    const data = await res.json();
    if (!res.ok) {
      toast.error(data.error ?? "Checklist is not complete");
      return;
    }
    toast.success("Checklist marked complete");
    await load();
    await onUpdated?.();
  }

  async function completeAllChecklists() {
    const incomplete = checklists.filter((c) => c.status !== "COMPLETED");
    for (const checklist of incomplete) {
      const res = await fetch(`/api/visits/${visitId}/checklists/${checklist.id}/complete`, {
        method: "POST",
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        toast.error(data.error ?? `Could not complete “${checklist.name}”`);
        await load();
        return;
      }
    }
    toast.success(incomplete.length ? "Checklist marked complete" : "Already complete");
    await load();
    await onUpdated?.();
  }

  async function uploadMedia(item: ChecklistItem, checklistId: string, file: File) {
    const formData = new FormData();
    formData.append("file", file);
    const uploadRes = await fetch(`/api/visits/${visitId}/attachments`, {
      method: "POST",
      body: formData,
    });
    if (!uploadRes.ok) {
      toast.error("Upload failed");
      return;
    }
    const attachment = await uploadRes.json();
    const existing =
      item.response &&
      typeof item.response === "object" &&
      Array.isArray((item.response as { attachmentIds?: string[] }).attachmentIds)
        ? (item.response as { attachmentIds: string[] }).attachmentIds
        : [];
    await saveItem(checklistId, item.id, {
      attachmentIds: [...existing, attachment.id],
    });
  }

  const mergedProgress = useMemo(() => {
    return checklists.reduce(
      (acc, checklist) => ({
        requiredComplete: acc.requiredComplete + checklist.progress.requiredComplete,
        requiredTotal: acc.requiredTotal + checklist.progress.requiredTotal,
        itemCount: acc.itemCount + checklist.progress.itemCount,
      }),
      { requiredComplete: 0, requiredTotal: 0, itemCount: 0 }
    );
  }, [checklists]);

  const mergedItems = useMemo(() => {
    return checklists.flatMap((checklist) =>
      checklist.items.map((item) => ({
        checklistId: checklist.id,
        checklistName: checklist.name,
        item,
      }))
    );
  }, [checklists]);

  const anyRequired = checklists.some((c) => c.requiredForCompletion);
  const allComplete =
    checklists.length > 0 && checklists.every((c) => c.status === "COMPLETED");

  if (loading) {
    return (
      <Card>
        <CardContent className="py-6 text-sm text-muted-foreground">Loading checklists…</CardContent>
      </Card>
    );
  }

  if (!checklists.length) {
    return null;
  }

  if (mergeVisitChecklists) {
    return (
      <Card>
        <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2">
          <div className="space-y-1">
            <CardTitle className="text-base">Checklist</CardTitle>
            <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
              <span>
                {mergedProgress.requiredComplete}/{mergedProgress.requiredTotal} required
              </span>
              {anyRequired && <Badge variant="outline">Required for visit completion</Badge>}
              <Badge variant="secondary">{allComplete ? "COMPLETED" : "IN PROGRESS"}</Badge>
            </div>
          </div>
          {!allComplete && (
            <Button size="sm" variant="outline" onClick={() => void completeAllChecklists()}>
              Mark complete
            </Button>
          )}
        </CardHeader>
        <CardContent className="space-y-4">
          {mergedItems.map(({ checklistId, checklistName, item }) => (
            <div key={`${checklistId}-${item.id}`} className="space-y-2 rounded-md border p-3">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-sm font-medium">{item.label}</span>
                {item.required && (
                  <Badge variant="outline" className="text-[10px]">
                    Required
                  </Badge>
                )}
                <span className="text-[10px] text-muted-foreground">
                  {CHECKLIST_ITEM_TYPE_LABELS[item.type]}
                </span>
                {checklists.length > 1 ? (
                  <span className="text-[10px] text-muted-foreground">· {checklistName}</span>
                ) : null}
              </div>
              {item.helpText && <p className="text-xs text-muted-foreground">{item.helpText}</p>}
              <ChecklistItemInput
                item={item}
                disabled={savingItemId === item.id}
                onSave={(response) => saveItem(checklistId, item.id, response)}
                onUpload={(file) => uploadMedia(item, checklistId, file)}
              />
            </div>
          ))}
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {checklists.map((checklist) => (
        <Card key={checklist.id}>
          <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2">
            <div className="space-y-1">
              <CardTitle className="text-base">{checklist.name}</CardTitle>
              <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                <span>
                  {checklist.progress.requiredComplete}/{checklist.progress.requiredTotal} required
                </span>
                {checklist.requiredForCompletion && (
                  <Badge variant="outline">Required for visit completion</Badge>
                )}
                <Badge variant="secondary">{checklist.status.replace(/_/g, " ")}</Badge>
              </div>
            </div>
            {checklist.status !== "COMPLETED" && (
              <Button size="sm" variant="outline" onClick={() => completeChecklist(checklist.id)}>
                Mark complete
              </Button>
            )}
          </CardHeader>
          <CardContent className="space-y-4">
            {checklist.items.map((item) => (
              <div key={item.id} className="space-y-2 rounded-md border p-3">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-sm font-medium">{item.label}</span>
                  {item.required && (
                    <Badge variant="outline" className="text-[10px]">
                      Required
                    </Badge>
                  )}
                  <span className="text-[10px] text-muted-foreground">
                    {CHECKLIST_ITEM_TYPE_LABELS[item.type]}
                  </span>
                </div>
                {item.helpText && (
                  <p className="text-xs text-muted-foreground">{item.helpText}</p>
                )}
                <ChecklistItemInput
                  item={item}
                  disabled={savingItemId === item.id}
                  onSave={(response) => saveItem(checklist.id, item.id, response)}
                  onUpload={(file) => uploadMedia(item, checklist.id, file)}
                />
              </div>
            ))}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

function ChecklistItemInput({
  item,
  disabled,
  onSave,
  onUpload,
}: {
  item: ChecklistItem;
  disabled: boolean;
  onSave: (response: unknown) => void;
  onUpload: (file: File) => void;
}) {
  const response = item.response as Record<string, unknown> | null;

  switch (item.type) {
    case "PASS_FLAG_FAIL": {
      const value = response?.value as string | undefined;
      return (
        <div className="flex flex-wrap gap-2">
          {(["pass", "flag", "fail"] as const).map((option) => (
            <Button
              key={option}
              type="button"
              size="sm"
              variant={value === option ? "default" : "outline"}
              disabled={disabled}
              onClick={() => onSave({ value: option })}
            >
              {option.charAt(0).toUpperCase() + option.slice(1)}
            </Button>
          ))}
        </div>
      );
    }
    case "NUMBER": {
      return (
        <Input
          type="number"
          defaultValue={response?.value != null ? String(response.value) : ""}
          disabled={disabled}
          onBlur={(e) => {
            const num = e.target.value === "" ? null : Number(e.target.value);
            if (num == null || Number.isFinite(num)) onSave(num == null ? null : { value: num });
          }}
        />
      );
    }
    case "NOTE": {
      return (
        <textarea
          className={textareaClassName}
          defaultValue={typeof response?.text === "string" ? response.text : ""}
          disabled={disabled}
          rows={3}
          onBlur={(e: React.FocusEvent<HTMLTextAreaElement>) => onSave({ text: e.target.value })}
        />
      );
    }
    case "MEDIA": {
      const ids = Array.isArray(response?.attachmentIds) ? (response.attachmentIds as string[]) : [];
      return (
        <div className="space-y-2">
          <Input
            type="file"
            accept="image/*,application/pdf"
            disabled={disabled}
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) onUpload(file);
              e.target.value = "";
            }}
          />
          {ids.length > 0 && (
            <p className="text-xs text-muted-foreground">{ids.length} file(s) attached</p>
          )}
        </div>
      );
    }
    case "MULTI_SELECT": {
      const options = parseOptions(item.options);
      const values = Array.isArray(response?.values) ? (response.values as string[]) : [];
      return (
        <div className="space-y-2">
          {options.map((option) => (
            <label key={option.value} className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={values.includes(option.value)}
                disabled={disabled}
                onChange={(e) => {
                  const next = e.target.checked
                    ? [...values, option.value]
                    : values.filter((v) => v !== option.value);
                  onSave({ values: next });
                }}
              />
              {option.label}
            </label>
          ))}
        </div>
      );
    }
    case "SELECT_ONE": {
      const options = parseOptions(item.options);
      const value = typeof response?.value === "string" ? response.value : "";
      return (
        <select
          className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
          value={value}
          disabled={disabled}
          onChange={(e) => onSave({ value: e.target.value })}
        >
          <option value="">Select…</option>
          {options.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      );
    }
    case "CHECKBOX": {
      const checked = Boolean(response?.checked);
      return (
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={checked}
            disabled={disabled}
            onChange={(e) => onSave({ checked: e.target.checked })}
          />
          {item.label}
        </label>
      );
    }
    default:
      return null;
  }
}

function parseOptions(options: unknown): { value: string; label: string }[] {
  if (!Array.isArray(options)) return [];
  return options
    .map((o) => {
      if (typeof o !== "object" || !o) return null;
      const value = String((o as { value?: string }).value ?? "").trim();
      const label = String((o as { label?: string }).label ?? value).trim();
      if (!value) return null;
      return { value, label };
    })
    .filter(Boolean) as { value: string; label: string }[];
}
