"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { ContentArea } from "@/components/layout/ContentArea";
import { PageHeader } from "@/components/layout/PageHeader";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";

export default function StormAiGeneralPage() {
  const [showFab, setShowFab] = useState(true);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetch("/api/settings/company")
      .then((r) => r.json())
      .then((data) => setShowFab(data.showStormAiFab !== false))
      .catch(() => toast.error("Could not load Storm AI settings"))
      .finally(() => setLoading(false));
  }, []);

  async function save() {
    setSaving(true);
    try {
      const res = await fetch("/api/settings/company", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ showStormAiFab: showFab }),
      });
      if (!res.ok) throw new Error("Save failed");
      toast.success("Saved");
    } catch {
      toast.error("Could not save");
    } finally {
      setSaving(false);
    }
  }

  return (
    <ContentArea className="max-w-2xl">
      <PageHeader
        breadcrumb={["Settings", "Storm AI"]}
        title="Storm AI"
        subtitle="Assistant visibility, company policies, and technician diagnostic workflows"
      />
      <section className="rounded-lg border border-border bg-card p-6">
        <h3 className="text-lg font-semibold">General</h3>
        <p className="mt-1 mb-4 text-sm text-muted-foreground">
          Open Storm AI from the sparkles icon in the top-right of the CRM (
          <Link href="/storm-ai" className="text-primary underline underline-offset-2">
            /storm-ai
          </Link>
          ). It only reads CRM data through permission-checked tools.
        </p>
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-sm font-medium">Enable Storm AI</p>
            <p className="mt-0.5 text-xs text-muted-foreground">
              When off, the Storm AI page shows as disabled for this company. On by default.
            </p>
          </div>
          <Switch checked={showFab} onCheckedChange={setShowFab} disabled={loading} />
        </div>
        <Button className="mt-6" onClick={() => void save()} disabled={saving || loading}>
          {saving ? "Saving…" : "Save"}
        </Button>
      </section>

      <section className="mt-6 grid gap-4 sm:grid-cols-2">
        <Link
          href="/settings/storm-ai/policies"
          className="rounded-lg border border-border bg-card p-6 transition-colors hover:bg-muted/40"
        >
          <h3 className="text-lg font-semibold">Company policies</h3>
          <p className="mt-1 text-sm text-muted-foreground">
            Add, edit, or remove the written rules Storm AI must follow for discounts, callbacks,
            repairs, and customer service.
          </p>
        </Link>
        <Link
          href="/settings/storm-ai/technician-assistant"
          className="rounded-lg border border-border bg-card p-6 transition-colors hover:bg-muted/40"
        >
          <h3 className="text-lg font-semibold">Technician assistant</h3>
          <p className="mt-1 text-sm text-muted-foreground">
            Diagnostic workflows and the parts library Storm AI uses in the field.
          </p>
        </Link>
      </section>
    </ContentArea>
  );
}
