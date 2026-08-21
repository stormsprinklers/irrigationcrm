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

const AUTOSAVE_MS = 60_000;

function serializeIssueState(input: {
  name: string;
  description: string;
  active: boolean;
  entryNodeId: string;
  nodes: EditorNode[];
}) {
  return JSON.stringify({
    name: input.name,
    description: input.description,
    active: input.active,
    ...nodesToSavePayload(input.nodes, input.entryNodeId),
  });
}

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
  const [dirty, setDirty] = useState(false);
  const [lastSavedAt, setLastSavedAt] = useState<Date | null>(null);
  const [canUndo, setCanUndo] = useState(false);
  const [canRedo, setCanRedo] = useState(false);
  const historyRef = useRef<TechAssistHistoryApi | null>(null);
  const baselineRef = useRef("");
  const savingRef = useRef(false);
  const stateRef = useRef({ name, description, active, entryNodeId, nodes });
  stateRef.current = { name, description, active, entryNodeId, nodes };

  const load = useCallback(async () => {
    const res = await fetch(`/api/settings/storm-ai/issues/${issueId}`);
    if (!res.ok) {
      toast.error("Workflow not found");
      router.push("/settings/storm-ai/technician-assistant");
      return;
    }
    const issue = await res.json();
    const nextName = issue.name ?? "";
    const nextDescription = issue.description ?? "";
    const nextActive = issue.active !== false;
    const migrated = migrateLegacyNodes(issue.nodes ?? []);
    const nextNodes = migrated.length ? migrated : [emptyDiagnostic(0)];
    const nextEntry = issue.entryNodeId || migrated[0]?.id || nextNodes[0]?.id || "";
    setName(nextName);
    setDescription(nextDescription);
    setActive(nextActive);
    setNodes(nextNodes);
    setEntryNodeId(nextEntry);
    baselineRef.current = serializeIssueState({
      name: nextName,
      description: nextDescription,
      active: nextActive,
      entryNodeId: nextEntry,
      nodes: nextNodes,
    });
    setDirty(false);
    setLoading(false);
  }, [issueId, router]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (loading) return;
    const current = serializeIssueState({
      name,
      description,
      active,
      entryNodeId,
      nodes,
    });
    setDirty(current !== baselineRef.current);
  }, [name, description, active, entryNodeId, nodes, loading]);

  const save = useCallback(
    async (opts?: { silent?: boolean }) => {
      const silent = opts?.silent === true;
      const snapshot = stateRef.current;
      const serialized = serializeIssueState(snapshot);
      if (silent && serialized === baselineRef.current) return;
      if (savingRef.current) return;

      savingRef.current = true;
      setSaving(true);
      try {
        const payload = nodesToSavePayload(snapshot.nodes, snapshot.entryNodeId);
        const res = await fetch(`/api/settings/storm-ai/issues/${issueId}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: snapshot.name,
            description: snapshot.description,
            active: snapshot.active,
            ...payload,
          }),
        });
        if (!res.ok) throw new Error("save failed");
        baselineRef.current = serialized;
        setDirty(false);
        setLastSavedAt(new Date());
        if (!silent) toast.success("Saved");
      } catch {
        toast.error(silent ? "Autosave failed" : "Could not save");
      } finally {
        savingRef.current = false;
        setSaving(false);
      }
    },
    [issueId]
  );

  const saveRef = useRef(save);
  saveRef.current = save;

  useEffect(() => {
    if (loading) return;
    const timer = window.setInterval(() => {
      void saveRef.current({ silent: true });
    }, AUTOSAVE_MS);
    return () => window.clearInterval(timer);
  }, [loading, issueId]);

  if (loading) {
    return (
      <ContentArea>
        <p className="text-sm text-muted-foreground">Loading…</p>
      </ContentArea>
    );
  }

  const saveStatus = saving
    ? "Saving…"
    : dirty
      ? "Unsaved changes"
      : lastSavedAt
        ? "Saved"
        : null;

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
        {saveStatus ? (
          <span
            className={`shrink-0 text-xs ${
              dirty && !saving ? "text-amber-700" : "text-muted-foreground"
            }`}
            title="Autosaves every 60 seconds while there are unsaved changes"
          >
            {saveStatus}
          </span>
        ) : null}
        <Button
          onClick={() => void save()}
          disabled={saving || !dirty}
          size="sm"
          className="shrink-0"
        >
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
