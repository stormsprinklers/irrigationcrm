"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { ContentArea } from "@/components/layout/ContentArea";
import { PageHeader } from "@/components/layout/PageHeader";
import { RachioControllersHub } from "@/components/rachio/RachioControllersHub";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

type RachioTestResult = {
  personId: string;
  fullName: string | null;
  email: string | null;
  deviceCount: number;
};

export default function SettingsRachioPage() {
  const [rachioApiKey, setRachioApiKey] = useState("");
  const [rachioPersonId, setRachioPersonId] = useState<string | null>(null);
  const [rachioTest, setRachioTest] = useState<RachioTestResult | null>(null);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  /** Only fetch device overview after an explicit test or Load — avoids crashing on heavy auto-load. */
  const [hubReady, setHubReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/settings/company")
      .then(async (r) => {
        const data = await r.json().catch(() => ({}));
        if (!r.ok || cancelled) return;
        setRachioApiKey(typeof data.rachioApiKey === "string" ? data.rachioApiKey : "");
        setRachioPersonId(
          typeof data.rachioPersonId === "string" ? data.rachioPersonId : null
        );
      })
      .catch(() => {
        if (!cancelled) toast.error("Failed to load Rachio settings");
      });
    return () => {
      cancelled = true;
    };
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
      toast.success("API key saved");
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
        const saveRes = await fetch("/api/settings/company", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ rachioApiKey }),
        });
        if (!saveRes.ok) throw new Error("Failed to save API key");
      }

      const res = await fetch("/api/settings/rachio/test", { method: "POST" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? "Connection failed");

      setRachioPersonId(typeof data.personId === "string" ? data.personId : null);
      setRachioTest({
        personId: data.personId,
        fullName: data.fullName ?? null,
        email: data.email ?? null,
        deviceCount: Number(data.deviceCount) || 0,
      });
      setHubReady(true);
      toast.success("Rachio connected");
    } catch (err) {
      setHubReady(false);
      toast.error(err instanceof Error ? err.message : "Connection failed");
    } finally {
      setTesting(false);
    }
  }

  return (
    <ContentArea className="max-w-3xl">
      <PageHeader
        breadcrumb={["Settings", "Integrations", "Rachio"]}
        title="Rachio"
        subtitle="Connect your Rachio account and link controllers to customer properties."
        actions={
          <Button size="sm" onClick={() => void save()} disabled={saving}>
            {saving ? "Saving..." : "Save key"}
          </Button>
        }
      />

      <div className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">API key</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-sm text-muted-foreground">
              Get an API key from the Rachio app (Settings → API Key). Save the key, then test the
              connection to fetch your person ID and controller list.
            </p>
            <Input
              type="password"
              placeholder="Rachio API key"
              value={rachioApiKey}
              onChange={(e) => setRachioApiKey(e.target.value)}
              autoComplete="off"
            />
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => void testRachio()}
                disabled={testing}
              >
                {testing ? "Testing…" : "Test connection"}
              </Button>
              {rachioPersonId && !hubReady ? (
                <Button type="button" variant="secondary" onClick={() => setHubReady(true)}>
                  Load controllers
                </Button>
              ) : null}
            </div>
            {rachioPersonId ? (
              <div className="rounded-md border border-green-200 bg-green-50 p-3 text-sm text-green-900">
                <p className="font-medium">Connected</p>
                <p>Person ID: {rachioPersonId}</p>
                {rachioTest?.fullName ? <p>Account: {rachioTest.fullName}</p> : null}
                {rachioTest?.deviceCount != null ? (
                  <p>{rachioTest.deviceCount} controller(s) available</p>
                ) : null}
                <p className="mt-2 text-green-800">
                  Next: link controllers below, then manage zones on each customer&apos;s{" "}
                  <strong>Properties</strong> tab.
                </p>
              </div>
            ) : (
              <p className="text-xs text-muted-foreground">
                Test the connection after saving your API key.
              </p>
            )}
          </CardContent>
        </Card>

        <RachioControllersHub connected={Boolean(rachioPersonId) && hubReady} />

        <Button variant="outline" asChild>
          <Link href="/settings/integrations">Back to integrations</Link>
        </Button>
      </div>
    </ContentArea>
  );
}
