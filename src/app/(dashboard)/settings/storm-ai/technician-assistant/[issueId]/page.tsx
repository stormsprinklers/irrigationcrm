"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { toast } from "sonner";
import { ContentArea } from "@/components/layout/ContentArea";
import { PageHeader } from "@/components/layout/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";

type NodeType = "DIAGNOSTIC" | "BRANCH" | "RESOLUTION";

type BranchRule = {
  op: "lt" | "gt" | "lte" | "gte" | "eq" | "between" | "in";
  value?: string;
  min?: string;
  max?: string;
  values?: string;
  nextNodeId?: string;
};

type EditorNode = {
  id: string;
  type: NodeType;
  title: string;
  body: string;
  sortOrder: number;
  inputType: "number" | "yes_no" | "choice" | "text";
  unit: string;
  choices: string;
  rules: BranchRule[];
  defaultNextNodeId: string;
};

function newId() {
  if (typeof crypto !== "undefined" && crypto.randomUUID) return crypto.randomUUID();
  return `tmp-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

function emptyNode(type: NodeType, sortOrder: number): EditorNode {
  return {
    id: newId(),
    type,
    title: type === "DIAGNOSTIC" ? "Diagnostic" : type === "BRANCH" ? "If / then" : "Resolution",
    body: "",
    sortOrder,
    inputType: "number",
    unit: "",
    choices: "",
    rules: [{ op: "lt", value: "", nextNodeId: "" }],
    defaultNextNodeId: "",
  };
}

export default function TechAssistIssueEditorPage() {
  const params = useParams<{ issueId: string }>();
  const router = useRouter();
  const issueId = params.issueId;
  const [name, setName] = useState("");
  const [trigger, setTrigger] = useState("");
  const [description, setDescription] = useState("");
  const [keywords, setKeywords] = useState("");
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
    setTrigger(issue.trigger ?? "");
    setDescription(issue.description ?? "");
    setKeywords(Array.isArray(issue.keywords) ? issue.keywords.join(", ") : "");
    setActive(issue.active !== false);
    setEntryNodeId(issue.entryNodeId ?? "");
    setNodes(
      (issue.nodes ?? []).map(
        (
          node: {
            id: string;
            type: NodeType;
            title: string;
            body: string;
            sortOrder: number;
            config?: Record<string, unknown>;
          },
          index: number
        ) => {
          const config = node.config && typeof node.config === "object" ? node.config : {};
          const rules = Array.isArray(config.rules) ? config.rules : [];
          return {
            id: node.id,
            type: node.type,
            title: node.title,
            body: node.body ?? "",
            sortOrder: node.sortOrder ?? index,
            inputType: (config.inputType as EditorNode["inputType"]) || "number",
            unit: String(config.unit ?? ""),
            choices: Array.isArray(config.choices) ? config.choices.join(", ") : "",
            rules:
              rules.length > 0
                ? rules.map((rule: Record<string, unknown>) => ({
                    op: (rule.op as BranchRule["op"]) || "eq",
                    value: rule.value != null ? String(rule.value) : "",
                    min: rule.min != null ? String(rule.min) : "",
                    max: rule.max != null ? String(rule.max) : "",
                    values: Array.isArray(rule.values) ? rule.values.join(", ") : "",
                    nextNodeId: String(rule.nextNodeId ?? ""),
                  }))
                : [{ op: "lt" as const, value: "", nextNodeId: "" }],
            defaultNextNodeId: String(config.defaultNextNodeId ?? ""),
          };
        }
      )
    );
    setLoading(false);
  }, [issueId, router]);

  useEffect(() => {
    void load();
  }, [load]);

  function updateNode(id: string, patch: Partial<EditorNode>) {
    setNodes((prev) => prev.map((n) => (n.id === id ? { ...n, ...patch } : n)));
  }

  async function save() {
    setSaving(true);
    try {
      const payload = {
        name,
        trigger,
        description,
        keywords: keywords
          .split(/[,;]+/)
          .map((k) => k.trim())
          .filter(Boolean),
        entryNodeId: entryNodeId || nodes[0]?.id || null,
        nodes: nodes.map((node, index) => ({
          id: node.id,
          type: node.type,
          title: node.title,
          body: node.body,
          sortOrder: index,
          config:
            node.type === "DIAGNOSTIC"
              ? {
                  inputType: node.inputType,
                  unit: node.unit || undefined,
                  prompt: node.body,
                  choices:
                    node.inputType === "choice"
                      ? node.choices
                          .split(/[,;]+/)
                          .map((c) => c.trim())
                          .filter(Boolean)
                      : node.inputType === "yes_no"
                        ? ["yes", "no"]
                        : undefined,
                }
              : node.type === "BRANCH"
                ? {
                    source: "previous",
                    rules: node.rules.map((rule) => ({
                      op: rule.op,
                      value: rule.value === "" ? undefined : Number.isNaN(Number(rule.value))
                        ? rule.value
                        : Number(rule.value),
                      min: rule.min === "" ? undefined : Number(rule.min),
                      max: rule.max === "" ? undefined : Number(rule.max),
                      values: rule.values
                        ? rule.values
                            .split(/[,;]+/)
                            .map((v) => v.trim())
                            .filter(Boolean)
                        : undefined,
                      nextNodeId: rule.nextNodeId || undefined,
                    })),
                    defaultNextNodeId: node.defaultNextNodeId || null,
                  }
                : {},
        })),
      };
      const res = await fetch(`/api/settings/storm-ai/issues/${issueId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...payload, active }),
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
    <ContentArea className="max-w-3xl">
      <PageHeader
        breadcrumb={["Settings", "Storm AI", "Technician Assistant", name || "Issue"]}
        title={name || "Diagnostic workflow"}
        subtitle="Storm AI asks one diagnostic at a time. Branches stay on the server."
      />

      <div className="mb-6 space-y-3 rounded-lg border border-border bg-card p-4">
        <label className="block text-sm">
          Issue name
          <Input className="mt-1" value={name} onChange={(e) => setName(e.target.value)} />
        </label>
        <label className="block text-sm">
          Trigger phrase
          <Input className="mt-1" value={trigger} onChange={(e) => setTrigger(e.target.value)} />
        </label>
        <label className="block text-sm">
          Description (shown when matching)
          <Input
            className="mt-1"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
        </label>
        <label className="block text-sm">
          Keywords (comma-separated)
          <Input className="mt-1" value={keywords} onChange={(e) => setKeywords(e.target.value)} />
        </label>
        <div className="flex items-center justify-between">
          <span className="text-sm">Active</span>
          <Switch checked={active} onCheckedChange={setActive} />
        </div>
        <label className="block text-sm">
          Starting step
          <select
            className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
            value={entryNodeId}
            onChange={(e) => setEntryNodeId(e.target.value)}
          >
            <option value="">First in list</option>
            {nodes.map((node) => (
              <option key={node.id} value={node.id}>
                {node.title}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="mb-3 flex flex-wrap gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => setNodes((p) => [...p, emptyNode("DIAGNOSTIC", p.length)])}
        >
          Add diagnostic
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => setNodes((p) => [...p, emptyNode("BRANCH", p.length)])}
        >
          Add branch
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => setNodes((p) => [...p, emptyNode("RESOLUTION", p.length)])}
        >
          Add resolution
        </Button>
      </div>

      <div className="space-y-4">
        {nodes.map((node, index) => (
          <div key={node.id} className="rounded-lg border border-border bg-card p-4">
            <div className="mb-3 flex items-center justify-between gap-2">
              <p className="text-xs font-medium uppercase text-muted-foreground">
                {index + 1}. {node.type}
              </p>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => setNodes((p) => p.filter((n) => n.id !== node.id))}
              >
                Delete step
              </Button>
            </div>
            <Input
              className="mb-2"
              value={node.title}
              onChange={(e) => updateNode(node.id, { title: e.target.value })}
              placeholder="Title"
            />
            <textarea
              className="mb-3 min-h-[72px] w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
              value={node.body}
              onChange={(e) => updateNode(node.id, { body: e.target.value })}
              placeholder={
                node.type === "RESOLUTION"
                  ? "What the technician should do"
                  : "Instructions for this step"
              }
            />
            {node.type === "DIAGNOSTIC" ? (
              <div className="grid gap-2 sm:grid-cols-2">
                <label className="text-sm">
                  Result type
                  <select
                    className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
                    value={node.inputType}
                    onChange={(e) =>
                      updateNode(node.id, {
                        inputType: e.target.value as EditorNode["inputType"],
                      })
                    }
                  >
                    <option value="number">Number</option>
                    <option value="yes_no">Yes / no</option>
                    <option value="choice">Choice</option>
                    <option value="text">Text</option>
                  </select>
                </label>
                <label className="text-sm">
                  Unit (optional)
                  <Input
                    className="mt-1"
                    value={node.unit}
                    onChange={(e) => updateNode(node.id, { unit: e.target.value })}
                    placeholder="ohms"
                  />
                </label>
                {node.inputType === "choice" ? (
                  <label className="text-sm sm:col-span-2">
                    Choices (comma-separated)
                    <Input
                      className="mt-1"
                      value={node.choices}
                      onChange={(e) => updateNode(node.id, { choices: e.target.value })}
                    />
                  </label>
                ) : null}
              </div>
            ) : null}
            {node.type === "BRANCH" ? (
              <div className="space-y-2">
                <p className="text-xs text-muted-foreground">
                  Compare the previous diagnostic result (e.g. ohms &lt; 20 or &gt; 60 → replace
                  solenoid).
                </p>
                {node.rules.map((rule, ri) => (
                  <div key={ri} className="grid gap-2 rounded-md border border-border p-2 sm:grid-cols-4">
                    <select
                      className="rounded-md border border-border bg-background px-2 py-1 text-sm"
                      value={rule.op}
                      onChange={(e) => {
                        const rules = [...node.rules];
                        rules[ri] = { ...rule, op: e.target.value as BranchRule["op"] };
                        updateNode(node.id, { rules });
                      }}
                    >
                      <option value="lt">less than</option>
                      <option value="gt">greater than</option>
                      <option value="lte">≤</option>
                      <option value="gte">≥</option>
                      <option value="between">between</option>
                      <option value="eq">equals</option>
                      <option value="in">is one of</option>
                    </select>
                    {rule.op === "between" ? (
                      <>
                        <Input
                          placeholder="min"
                          value={rule.min ?? ""}
                          onChange={(e) => {
                            const rules = [...node.rules];
                            rules[ri] = { ...rule, min: e.target.value };
                            updateNode(node.id, { rules });
                          }}
                        />
                        <Input
                          placeholder="max"
                          value={rule.max ?? ""}
                          onChange={(e) => {
                            const rules = [...node.rules];
                            rules[ri] = { ...rule, max: e.target.value };
                            updateNode(node.id, { rules });
                          }}
                        />
                      </>
                    ) : rule.op === "in" ? (
                      <Input
                        className="sm:col-span-2"
                        placeholder="yes, no"
                        value={rule.values ?? ""}
                        onChange={(e) => {
                          const rules = [...node.rules];
                          rules[ri] = { ...rule, values: e.target.value };
                          updateNode(node.id, { rules });
                        }}
                      />
                    ) : (
                      <Input
                        className="sm:col-span-2"
                        placeholder="value"
                        value={rule.value ?? ""}
                        onChange={(e) => {
                          const rules = [...node.rules];
                          rules[ri] = { ...rule, value: e.target.value };
                          updateNode(node.id, { rules });
                        }}
                      />
                    )}
                    <select
                      className="rounded-md border border-border bg-background px-2 py-1 text-sm"
                      value={rule.nextNodeId ?? ""}
                      onChange={(e) => {
                        const rules = [...node.rules];
                        rules[ri] = { ...rule, nextNodeId: e.target.value };
                        updateNode(node.id, { rules });
                      }}
                    >
                      <option value="">Then go to…</option>
                      {nodes
                        .filter((n) => n.id !== node.id)
                        .map((n) => (
                          <option key={n.id} value={n.id}>
                            {n.title}
                          </option>
                        ))}
                    </select>
                  </div>
                ))}
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() =>
                    updateNode(node.id, {
                      rules: [...node.rules, { op: "gt", value: "", nextNodeId: "" }],
                    })
                  }
                >
                  Add rule
                </Button>
                <label className="block text-sm">
                  Default next step
                  <select
                    className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
                    value={node.defaultNextNodeId}
                    onChange={(e) => updateNode(node.id, { defaultNextNodeId: e.target.value })}
                  >
                    <option value="">None (end)</option>
                    {nodes
                      .filter((n) => n.id !== node.id)
                      .map((n) => (
                        <option key={n.id} value={n.id}>
                          {n.title}
                        </option>
                      ))}
                  </select>
                </label>
              </div>
            ) : null}
          </div>
        ))}
      </div>

      <Button className="mt-6" onClick={() => void save()} disabled={saving}>
        {saving ? "Saving…" : "Save workflow"}
      </Button>
    </ContentArea>
  );
}
