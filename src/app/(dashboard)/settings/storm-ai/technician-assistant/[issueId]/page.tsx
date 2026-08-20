"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { Redo2, Undo2 } from "lucide-react";
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
  type TechAssistHistoryApi,
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
  const [canUndo, setCanUndo] = useState(false);
  const [canRedo, setCanRedo] = useState(false);
  const historyRef = useRef<TechAssistHistoryApi | null>(null);

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
    <ContentArea className="flex h-full max-w-none flex-col overflow-hidden !p-0">
      <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-border bg-card px-3 py-2">
        <Link
          href="/settings/storm-ai/technician-assistant"
          className="shrink-0 border-b-2 border-primary px-2 py-1 text-sm font-medium text-foreground"
        >
          Issues
        </Link>
        <Input
          className="h-8 min-w-[10rem] max-w-xs flex-1 text-sm font-semibold"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Issue title"
          aria-label="Issue title"
        />
        <Input
          className="h-8 min-w-[12rem] max-w-md flex-[1.4] text-sm"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Description — when Storm AI should pick this…"
          aria-label="Issue description"
        />
        <label className="flex shrink-0 items-center gap-2 text-sm">
          <span className="text-muted-foreground">Active</span>
          <Switch checked={active} onCheckedChange={setActive} />
        </label>
        <div className="flex shrink-0 items-center gap-0.5">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-8 w-8 px-0"
            disabled={!canUndo}
            onClick={() => historyRef.current?.undo()}
            aria-label="Undo"
            title="Undo (Ctrl+Z)"
          >
            <Undo2 className="h-4 w-4" />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-8 w-8 px-0"
            disabled={!canRedo}
            onClick={() => historyRef.current?.redo()}
            aria-label="Redo"
            title="Redo (Ctrl+Y)"
          >
            <Redo2 className="h-4 w-4" />
          </Button>
        </div>
        <Button onClick={() => void save()} disabled={saving} size="sm" className="shrink-0">
          {saving ? "Saving…" : "Save"}
        </Button>
      </div>

      <div className="relative min-h-0 flex-1">
        <TechAssistFlowEditor
          nodes={nodes}
          entryNodeId={entryNodeId}
          onChange={setNodes}
          onEntryChange={setEntryNodeId}
          historyKey={issueId}
          historyRef={historyRef}
          onHistoryStateChange={({ canUndo: u, canRedo: r }) => {
            setCanUndo(u);
            setCanRedo(r);
          }}
        />
      </div>
    </ContentArea>
  );
}
