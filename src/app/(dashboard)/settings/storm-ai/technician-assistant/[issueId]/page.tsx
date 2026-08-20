"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { toast } from "sonner";
import { ContentArea } from "@/components/layout/ContentArea";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import {
  TechAssistFlowEditor,
  emptyDiagnostic,
  migrateLegacyNodes,
  nodesToSavePayload,
  type EditorNode,
} from "@/components/settings/storm-ai/TechAssistFlowEditor";

export default function TechAssistIssueEditorPage() {
  const params = useParams<{ issueId: string }>();
  const router = useRouter();
  const issueId = params.issueId;
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [active, setActive] = useState(true);
  const [entryNodeId, setEntryNodeId] = useState("");
  const [nodes, setNodes] = useState<EditorNode[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    const res = await fetch(`/api/settings/storm-ai/issues/${issueId}`);
    if (!res.ok) {
      toast.error("Workflow not found");
      router.push("/settings/storm-ai/technician-assistant");
      return;
    }
    const issue = await res.json();
    setName(issue.name ?? "");
    setDescription(issue.description ?? "");
    setActive(issue.active !== false);
    const migrated = migrateLegacyNodes(issue.nodes ?? []);
    setNodes(migrated.length ? migrated : [emptyDiagnostic(0)]);
    setEntryNodeId(issue.entryNodeId || migrated[0]?.id || "");
    setLoading(false);
  }, [issueId, router]);

  useEffect(() => {
    void load();
  }, [load]);

  async function save() {
    setSaving(true);
    try {
      const payload = nodesToSavePayload(nodes, entryNodeId);
      const res = await fetch(`/api/settings/storm-ai/issues/${issueId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          description,
          active,
          ...payload,
        }),
      });
      if (!res.ok) throw new Error("save failed");
      toast.success("Saved");
      await load();
    } catch {
      toast.error("Could not save");
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <ContentArea>
        <p className="text-sm text-muted-foreground">Loading…</p>
      </ContentArea>
    );
  }

  return (
    <ContentArea className="relative h-full max-w-none overflow-hidden !p-0">
      <div className="absolute inset-0">
        <TechAssistFlowEditor
          nodes={nodes}
          entryNodeId={entryNodeId}
          onChange={setNodes}
          onEntryChange={setEntryNodeId}
        />
      </div>

      <div className="pointer-events-none absolute left-4 right-4 top-3 z-20 max-w-xl lg:right-auto">
        <div className="pointer-events-auto rounded-lg border border-border/80 bg-white/95 p-3 shadow-md backdrop-blur-sm">
          <div className="flex flex-wrap items-start gap-3">
            <label className="min-w-[10rem] flex-1 text-xs font-medium text-muted-foreground">
              Title
              <Input
                className="mt-1 h-8 text-sm font-semibold"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Zone valve not opening"
              />
            </label>
            <div className="flex items-center gap-3 pt-5">
              <label className="flex items-center gap-2 text-sm">
                <span className="text-muted-foreground">Active</span>
                <Switch checked={active} onCheckedChange={setActive} />
              </label>
              <Button onClick={() => void save()} disabled={saving} size="sm">
                {saving ? "Saving…" : "Save"}
              </Button>
            </div>
          </div>
          <label className="mt-2 block text-xs font-medium text-muted-foreground">
            Description
            <textarea
              className="mt-1 max-h-16 min-h-[2.25rem] w-full resize-y rounded-md border border-border bg-background px-3 py-1.5 text-sm"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="When Storm AI should pick this issue…"
              rows={1}
            />
          </label>
        </div>
      </div>
    </ContentArea>
  );
}
