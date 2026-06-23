"use client";

import { useCallback, useEffect, useState } from "react";
import { ContentArea } from "@/components/layout/ContentArea";
import { PageHeader } from "@/components/layout/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";

type Credential = {
  id: string;
  type: string;
  label: string;
  keyPrefix: string;
  enabled: boolean;
  lastUsedAt: string | null;
  createdAt: string;
};

type IntegrationUrls = {
  crm: string;
  lms: string;
  design: string;
  website: string;
};

const INTEGRATION_TYPES = ["WEBSITE", "LMS", "DESIGN", "MAPS"] as const;

export default function SettingsIntegrationsPage() {
  const [credentials, setCredentials] = useState<Credential[]>([]);
  const [urls, setUrls] = useState<IntegrationUrls | null>(null);
  const [loading, setLoading] = useState(true);
  const [newType, setNewType] = useState<(typeof INTEGRATION_TYPES)[number]>("WEBSITE");
  const [newLabel, setNewLabel] = useState("");
  const [creating, setCreating] = useState(false);
  const [revealedKey, setRevealedKey] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/settings/integrations");
      if (!res.ok) throw new Error();
      const data = await res.json();
      setCredentials(data.credentials);
      setUrls(data.urls);
    } catch {
      toast.error("Failed to load integrations");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function createKey() {
    setCreating(true);
    try {
      const res = await fetch("/api/settings/integrations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: newType, label: newLabel || `${newType} key` }),
      });
      if (!res.ok) throw new Error();
      const data = await res.json();
      setRevealedKey(data.rawKey);
      toast.success("Integration key created — copy it now");
      await load();
      setNewLabel("");
    } catch {
      toast.error("Failed to create key");
    } finally {
      setCreating(false);
    }
  }

  async function revoke(id: string) {
    if (!confirm("Revoke this integration key? Spokes using it will stop working.")) return;
    try {
      const res = await fetch(`/api/settings/integrations/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error();
      toast.success("Key revoked");
      await load();
    } catch {
      toast.error("Failed to revoke key");
    }
  }

  return (
    <ContentArea className="max-w-3xl">
      <PageHeader breadcrumb={["Settings", "Integrations"]} title="Integrations" />

      {loading ? (
        <p className="text-sm text-muted-foreground">Loading...</p>
      ) : (
        <div className="space-y-6">
          {urls && (
            <div className="rounded-lg border border-border bg-white p-6 space-y-2">
              <h2 className="font-medium">Spoke URLs</h2>
              <p className="text-sm text-muted-foreground">
                Configure these in each app&apos;s environment (server-side only for keys).
              </p>
              <dl className="grid gap-2 text-sm mt-3">
                {Object.entries(urls).map(([key, value]) => (
                  <div key={key} className="flex gap-2">
                    <dt className="w-24 capitalize text-muted-foreground">{key}</dt>
                    <dd className="font-mono text-xs break-all">{value || "—"}</dd>
                  </div>
                ))}
              </dl>
            </div>
          )}

          {revealedKey && (
            <div className="rounded-lg border border-amber-300 bg-amber-50 p-4 space-y-2">
              <p className="text-sm font-medium text-amber-900">Copy this key now — it won&apos;t be shown again</p>
              <code className="block text-xs break-all bg-white p-2 rounded border">{revealedKey}</code>
              <Button size="sm" variant="outline" onClick={() => {
                navigator.clipboard.writeText(revealedKey);
                toast.success("Copied");
              }}>
                Copy to clipboard
              </Button>
            </div>
          )}

          <div className="rounded-lg border border-border bg-white p-6 space-y-4">
            <h2 className="font-medium">API keys</h2>
            <div className="flex flex-wrap gap-2 items-end">
              <div>
                <label className="text-xs text-muted-foreground">Type</label>
                <select
                  className="mt-1 block rounded-md border border-input px-3 py-2 text-sm"
                  value={newType}
                  onChange={(e) => setNewType(e.target.value as typeof newType)}
                >
                  {INTEGRATION_TYPES.map((t) => (
                    <option key={t} value={t}>{t}</option>
                  ))}
                </select>
              </div>
              <div className="flex-1 min-w-[160px]">
                <label className="text-xs text-muted-foreground">Label</label>
                <Input
                  className="mt-1"
                  value={newLabel}
                  onChange={(e) => setNewLabel(e.target.value)}
                  placeholder="Production website"
                />
              </div>
              <Button onClick={createKey} disabled={creating}>
                {creating ? "Creating..." : "Generate key"}
              </Button>
            </div>

            {credentials.length === 0 ? (
              <p className="text-sm text-muted-foreground">No integration keys yet.</p>
            ) : (
              <ul className="divide-y divide-border">
                {credentials.map((c) => (
                  <li key={c.id} className="py-3 flex items-center justify-between gap-4">
                    <div>
                      <p className="text-sm font-medium">{c.label}</p>
                      <p className="text-xs text-muted-foreground">
                        {c.type} · {c.keyPrefix}… · {c.enabled ? "Active" : "Disabled"}
                        {c.lastUsedAt && ` · Last used ${new Date(c.lastUsedAt).toLocaleDateString()}`}
                      </p>
                    </div>
                    <Button size="sm" variant="destructive" onClick={() => revoke(c.id)}>
                      Revoke
                    </Button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="rounded-lg border border-border bg-white p-6 text-sm text-muted-foreground space-y-2">
            <h2 className="font-medium text-foreground">Environment variables (spokes)</h2>
            <pre className="text-xs bg-muted p-3 rounded overflow-x-auto">{`CRM_INTEGRATION_URL=https://your-crm.example.com/api/integrations
CRM_INTEGRATION_KEY=crm_int_...
CRM_COMPANY_ID=optional-if-single-tenant`}</pre>
          </div>
        </div>
      )}
    </ContentArea>
  );
}
