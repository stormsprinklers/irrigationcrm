"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { toast } from "sonner";
import { ContentArea } from "@/components/layout/ContentArea";
import { PageHeader } from "@/components/layout/PageHeader";
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
    <ContentArea className="max-w-5xl">
      <PageHeader
        breadcrumb={["Settings", "Storm AI", "Technician Assistant", name || "Issue"]}
        title={name || "Diagnostic workflow"}
        subtitle="Title and description help Storm AI pick this issue. Diagnostics branch visually like call flows."
      />

      <div className="mb-6 space-y-3 rounded-lg border border-border bg-card p-4">
        <label className="block text-sm">
          Title
          <Input
            className="mt-1"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Zone valve not opening"
          />
        </label>
        <label className="block text-sm">
          Description
          <textarea
            className="mt-1 min-h-[80px] w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="When a zone has power but no water, or the valve will not open…"
          />
        </label>
        <div className="flex items-center justify-between">
          <span className="text-sm">Active</span>
          <Switch checked={active} onCheckedChange={setActive} />
        </div>
      </div>

      <TechAssistFlowEditor
        nodes={nodes}
        entryNodeId={entryNodeId}
        onChange={setNodes}
        onEntryChange={setEntryNodeId}
      />

      <div className="mt-6 flex justify-end">
        <Button onClick={() => void save()} disabled={saving}>
          {saving ? "Saving…" : "Save workflow"}
        </Button>
      </div>
    </ContentArea>
  );
}
