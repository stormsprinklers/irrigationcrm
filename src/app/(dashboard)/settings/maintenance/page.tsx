"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { ContentArea } from "@/components/layout/ContentArea";
import { PageHeader } from "@/components/layout/PageHeader";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { SmartIrrigationPanel } from "@/components/maintenance-plans/SmartIrrigationPanel";
import type { CompanySettingsDTO } from "@/lib/company/types";

export default function SettingsMaintenancePage() {
  const [keys, setKeys] = useState({ rachioApiKey: "", hydrawiseApiKey: "" });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetch("/api/settings/company")
      .then((r) => r.json())
      .then((data: CompanySettingsDTO) =>
        setKeys({ rachioApiKey: data.rachioApiKey ?? "", hydrawiseApiKey: data.hydrawiseApiKey ?? "" })
      );
  }, []);

  async function save() {
    setSaving(true);
    try {
      const res = await fetch("/api/settings/company", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(keys),
      });
      if (!res.ok) throw new Error();
      toast.success("API keys saved");
    } catch {
      toast.error("Failed to save");
    } finally {
      setSaving(false);
    }
  }

  return (
    <ContentArea className="max-w-3xl">
      <PageHeader
        breadcrumb={["Settings", "Maintenance"]}
        title="Maintenance plan settings"
        subtitle="Configure smart irrigation integrations for maintenance plans."
        actions={<Button size="sm" onClick={save} disabled={saving}>{saving ? "Saving..." : "Save keys"}</Button>}
      />

      <div className="space-y-6">
        <SmartIrrigationPanel />

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Rachio API key</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-sm text-muted-foreground">
              Store your Rachio API key for future zone sync. Live integration is not enabled yet.
            </p>
            <Input
              type="password"
              placeholder="API key"
              value={keys.rachioApiKey}
              onChange={(e) => setKeys({ ...keys, rachioApiKey: e.target.value })}
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Hydrawise API key</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-sm text-muted-foreground">
              Store your Hydrawise API key for future controller sync.
            </p>
            <Input
              type="password"
              placeholder="API key"
              value={keys.hydrawiseApiKey}
              onChange={(e) => setKeys({ ...keys, hydrawiseApiKey: e.target.value })}
            />
          </CardContent>
        </Card>

        <Button variant="outline" asChild>
          <Link href="/maintenance-plans">Back to maintenance plans</Link>
        </Button>
      </div>
    </ContentArea>
  );
}
