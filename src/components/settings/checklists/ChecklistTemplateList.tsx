"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Copy, Pencil, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { formatChecklistRules } from "@/lib/checklists/labels";

export type ChecklistTemplateSummary = {
  id: string;
  name: string;
  description: string | null;
  active: boolean;
  applyToAllJobs: boolean;
  divisions: string[];
  excludeCallbacks: boolean;
  requiredForCompletion: boolean;
  priceBookItems: { id: string; name: string }[];
};

export function ChecklistTemplateList() {
  const router = useRouter();
  const [templates, setTemplates] = useState<ChecklistTemplateSummary[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    const res = await fetch("/api/settings/checklists");
    if (res.ok) setTemplates(await res.json());
  }, []);

  useEffect(() => {
    load().finally(() => setLoading(false));
  }, [load]);

  async function handleDelete(id: string, name: string) {
    if (!confirm(`Delete checklist "${name}"?`)) return;
    const res = await fetch(`/api/settings/checklists/${id}`, { method: "DELETE" });
    if (!res.ok) {
      toast.error("Failed to delete checklist");
      return;
    }
    toast.success("Checklist deleted");
    await load();
  }

  async function handleDuplicate(id: string) {
    const res = await fetch(`/api/settings/checklists/${id}/duplicate`, { method: "POST" });
    if (!res.ok) {
      toast.error("Failed to duplicate checklist");
      return;
    }
    const created = await res.json();
    toast.success("Checklist duplicated");
    router.push(`/settings/checklists/${created.id}`);
  }

  if (loading) {
    return <p className="text-sm text-muted-foreground">Loading checklists…</p>;
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button asChild>
          <Link href="/settings/checklists/new">
            <Plus className="mr-2 h-4 w-4" />
            New checklist
          </Link>
        </Button>
      </div>

      {!templates.length ? (
        <Card>
          <CardContent className="py-10 text-center text-sm text-muted-foreground">
            No checklists yet. Create one for technicians to complete on jobs.
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {templates.map((template) => (
            <Card key={template.id}>
              <CardContent className="flex flex-wrap items-start justify-between gap-4 py-4">
                <div className="space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="font-medium">{template.name}</h3>
                    {!template.active && <Badge variant="secondary">Inactive</Badge>}
                    {template.requiredForCompletion && (
                      <Badge variant="outline">Required to complete job</Badge>
                    )}
                  </div>
                  {template.description && (
                    <p className="text-sm text-muted-foreground">{template.description}</p>
                  )}
                  <p className="text-xs text-muted-foreground">
                    {formatChecklistRules(template)}
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button variant="outline" size="sm" asChild>
                    <Link href={`/settings/checklists/${template.id}`}>
                      <Pencil className="mr-1 h-3.5 w-3.5" />
                      Edit
                    </Link>
                  </Button>
                  <Button variant="outline" size="sm" onClick={() => handleDuplicate(template.id)}>
                    <Copy className="mr-1 h-3.5 w-3.5" />
                    Duplicate
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleDelete(template.id, template.name)}
                  >
                    <Trash2 className="mr-1 h-3.5 w-3.5" />
                    Delete
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
