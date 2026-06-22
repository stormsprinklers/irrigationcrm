"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { ContentArea } from "@/components/layout/ContentArea";
import { PageHeader } from "@/components/layout/PageHeader";
import { SmartIrrigationPanel } from "@/components/maintenance-plans/SmartIrrigationPanel";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import type { CompanySettingsDTO } from "@/lib/company/types";

type RachioTestResult = {
  personId: string;
  fullName: string | null;
  email: string | null;
  deviceCount: number;
};

export default function SettingsMaintenancePage() {
  const [rachioApiKey, setRachioApiKey] = useState("");
  const [rachioPersonId, setRachioPersonId] = useState<string | null>(null);
  const [rachioTest, setRachioTest] = useState<RachioTestResult | null>(null);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);

  useEffect(() => {
    fetch("/api/settings/company")
      .then((r) => r.json())
      .then((data: CompanySettingsDTO) => {
        setRachioApiKey(data.rachioApiKey ?? "");
        setRachioPersonId(data.rachioPersonId ?? null);
      });
  }, []);

  async function save() {
    setSaving(true);
    try {
      const res = await fetch("/api/settings/company", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rachioApiKey }),
      });
      if (!res.ok) throw new Error();
      toast.success("API keys saved");
    } catch {
      toast.error("Failed to save");
    } finally {
      setSaving(false);
    }
  }

  async function testRachio() {
    setTesting(true);
    try {
      if (rachioApiKey) {
        await fetch("/api/settings/company", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ rachioApiKey }),
        });
      }

      const res = await fetch("/api/settings/rachio/test", { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Connection failed");

      setRachioPersonId(data.personId);
      setRachioTest({
        personId: data.personId,
        fullName: data.fullName ?? null,
        email: data.email ?? null,
        deviceCount: data.deviceCount ?? 0,
      });
      toast.success("Rachio connected");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Connection failed");
    } finally {
      setTesting(false);
    }
  }

  return (
    <ContentArea className="max-w-3xl">
      <PageHeader
        breadcrumb={["Settings", "Maintenance"]}
        title="Maintenance plan settings"
        subtitle="Configure smart irrigation integrations for maintenance plans."
        actions={
          <Button size="sm" onClick={save} disabled={saving}>
            {saving ? "Saving..." : "Save keys"}
          </Button>
        }
      />

      <div className="space-y-6">
        <SmartIrrigationPanel personId={rachioPersonId} deviceCount={rachioTest?.deviceCount} />

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Rachio API key</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-sm text-muted-foreground">
              Get an API key from the Rachio app (Settings → API Key). Save the key, then test
              the connection to fetch your person ID and controller list.
            </p>
            <Input
              type="password"
              placeholder="Rachio API key"
              value={rachioApiKey}
              onChange={(e) => setRachioApiKey(e.target.value)}
            />
            <div className="flex flex-wrap gap-2">
              <Button type="button" variant="outline" onClick={() => void testRachio()} disabled={testing}>
                {testing ? "Testing…" : "Test connection"}
              </Button>
            </div>
            {rachioPersonId ? (
              <div className="rounded-md border border-green-200 bg-green-50 p-3 text-sm text-green-900">
                <p className="font-medium">Connected</p>
                <p>Person ID: {rachioPersonId}</p>
                {rachioTest?.fullName ? <p>Account: {rachioTest.fullName}</p> : null}
                {rachioTest?.deviceCount != null ? (
                  <p>{rachioTest.deviceCount} controller(s) available</p>
                ) : null}
              </div>
            ) : (
              <p className="text-xs text-muted-foreground">
                Test the connection after saving your API key.
              </p>
            )}
          </CardContent>
        </Card>

        <Button variant="outline" asChild>
          <Link href="/maintenance-plans">Back to maintenance plans</Link>
        </Button>
      </div>
    </ContentArea>
  );
}
