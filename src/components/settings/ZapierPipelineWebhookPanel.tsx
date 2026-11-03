"use client";

import { useCallback, useEffect, useState } from "react";
import { Loader2, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

type Settings = {
  configured: boolean;
  webhookPreview: string | null;
};

const FIELDS = [
  "First Name",
  "Last Name",
  "Email",
  "Phone",
  "City",
  "State",
  "Zip",
  "gclid",
  "gbraid",
  "wbraid",
  "user_agent",
  "Stage Name",
  "Amount",
];

export function ZapierPipelineWebhookPanel() {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [webhookUrl, setWebhookUrl] = useState("");
  const [saving, setSaving] = useState(false);
  const [removing, setRemoving] = useState(false);

  const load = useCallback(async () => {
    const response = await fetch("/api/marketing/zapier/settings");
    if (!response.ok) throw new Error("Could not load Zapier settings");
    setSettings((await response.json()) as Settings);
  }, []);

  useEffect(() => {
    load().catch((error) =>
      toast.error(error instanceof Error ? error.message : "Could not load Zapier settings")
    );
  }, [load]);

  async function save() {
    if (!webhookUrl.trim()) {
      toast.error("Paste the Catch Hook URL from Zapier");
      return;
    }
    setSaving(true);
    try {
      const response = await fetch("/api/marketing/zapier/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ webhookUrl }),
      });
      const result = (await response.json()) as Settings & { error?: string };
      if (!response.ok) throw new Error(result.error ?? "Could not save Zapier webhook");
      setSettings(result);
      setWebhookUrl("");
      toast.success("Zapier pipeline webhook saved");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not save Zapier webhook");
    } finally {
      setSaving(false);
    }
  }

  async function remove() {
    if (!confirm("Remove the Zapier webhook? New pipeline events will stop being sent to Zapier.")) {
      return;
    }
    setRemoving(true);
    try {
      const response = await fetch("/api/marketing/zapier/settings", { method: "DELETE" });
      const result = (await response.json()) as Settings & { error?: string };
      if (!response.ok) throw new Error(result.error ?? "Could not remove Zapier webhook");
      setSettings(result);
      setWebhookUrl("");
      toast.success("Zapier pipeline webhook removed");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not remove Zapier webhook");
    } finally {
      setRemoving(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <CardTitle className="text-base">Zapier Catch Hook</CardTitle>
            <CardDescription className="mt-1">
              POST each new Lead, Qualified, Converted, and Sold pipeline event to Zapier.
            </CardDescription>
          </div>
          <Badge variant={settings?.configured ? "success" : "secondary"}>
            {settings?.configured ? "Connected" : "Not configured"}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-5">
        {settings?.configured ? (
          <div className="rounded-md border bg-muted/30 p-3 text-sm">
            <p className="font-medium">Current webhook</p>
            <p className="mt-1 break-all text-muted-foreground">
              {settings.webhookPreview ?? "Configured"}
            </p>
          </div>
        ) : null}

        <div className="space-y-2">
          <label htmlFor="zapier-webhook-url" className="text-sm font-medium">
            {settings?.configured ? "Replace Catch Hook URL" : "Catch Hook URL"}
          </label>
          <Input
            id="zapier-webhook-url"
            type="password"
            autoComplete="off"
            placeholder="https://hooks.zapier.com/hooks/catch/..."
            value={webhookUrl}
            onChange={(event) => setWebhookUrl(event.target.value)}
          />
          <p className="text-xs text-muted-foreground">
            The full URL is stored as a secret and is never shown again after saving.
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          <Button disabled={saving || removing} onClick={() => void save()}>
            {saving ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : null}
            {settings?.configured ? "Replace webhook" : "Save webhook"}
          </Button>
          {settings?.configured ? (
            <Button variant="outline" disabled={saving || removing} onClick={() => void remove()}>
              {removing ? (
                <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
              ) : (
                <Trash2 className="mr-1.5 h-4 w-4" />
              )}
              Remove
            </Button>
          ) : null}
        </div>

        <div>
          <p className="text-sm font-medium">Fields sent</p>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {FIELDS.map((field) => (
              <Badge key={field} variant="outline">
                {field}
              </Badge>
            ))}
          </div>
          <p className="mt-2 text-xs text-muted-foreground">
            Unavailable fields are sent as blank values. Amount is populated for Converted and Sold
            events when a value is available.
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
