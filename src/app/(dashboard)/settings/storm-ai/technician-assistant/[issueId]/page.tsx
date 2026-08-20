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
    <ContentArea className="flex h-[calc(100dvh-9.5rem)] max-w-none flex-col gap-3 overflow-hidden pb-2">
      <div className="shrink-0 space-y-2 border-b border-border pb-3">
        <div className="flex flex-wrap items-start gap-3">
          <label className="min-w-[12rem] flex-1 text-xs font-medium text-muted-foreground">
            Title
            <Input
              className="mt-1 h-9 text-base font-semibold"
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
        <label className="block text-xs font-medium text-muted-foreground">
          Description
          <textarea
            className="mt-1 min-h-[2.75rem] max-h-24 w-full resize-y rounded-md border border-border bg-background px-3 py-2 text-sm"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="When Storm AI should pick this issue…"
            rows={2}
          />
        </label>
      </div>

      <TechAssistFlowEditor
        nodes={nodes}
        entryNodeId={entryNodeId}
        onChange={setNodes}
        onEntryChange={setEntryNodeId}
      />
    </ContentArea>
  );
}
