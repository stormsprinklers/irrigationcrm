"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Loader2, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";

type SlackGbpReviewsStatus = {
  slackConfigured: boolean;
  slackAuthOk: boolean;
  slackTeam: string | null;
  envHints: string[];
  gbpConnected: boolean;
  locationTitle: string | null;
  enabled: boolean;
  channelId: string | null;
  bootstrapped: boolean;
  deliveredCount: number;
  slackError: string | null;
};

export function SlackGbpReviewsPanel() {
  const [status, setStatus] = useState<SlackGbpReviewsStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [checking, setChecking] = useState(false);
  const [enabled, setEnabled] = useState(false);
  const [channelId, setChannelId] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/settings/slack/gbp-reviews");
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to load Slack settings");
      setStatus(data as SlackGbpReviewsStatus);
      setEnabled(Boolean(data.enabled));
      setChannelId(String(data.channelId ?? ""));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to load Slack settings");
      setStatus(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function save() {
    setSaving(true);
    try {
      const res = await fetch("/api/settings/slack/gbp-reviews", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled, channelId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to save");
      toast.success(
        data.bootstrapped > 0
          ? `Saved. Marked ${data.bootstrapped} existing reviews as seen — only new reviews will post to Slack.`
          : "Slack review alerts saved"
      );
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to save");
    } finally {
      setSaving(false);
    }
  }

  async function sendTest() {
    setTesting(true);
    try {
      const res = await fetch("/api/settings/slack/gbp-reviews/test", { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Test failed");
      toast.success("Sample review card sent to Slack");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Test failed");
    } finally {
      setTesting(false);
    }
  }

  async function checkNow() {
    setChecking(true);
    try {
      const res = await fetch("/api/settings/slack/gbp-reviews", { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Check failed");
      toast.success(
        data.posted > 0
          ? `Posted ${data.posted} new review${data.posted === 1 ? "" : "s"} to Slack`
          : "No new reviews to post"
      );
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Check failed");
    } finally {
      setChecking(false);
    }
  }

  if (loading) {
    return <p className="text-sm text-muted-foreground">Loading Slack settings…</p>;
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Google review alerts</CardTitle>
        <p className="text-sm text-muted-foreground">
          Post a designed image card to Slack whenever a new Google review arrives. Checks run
          automatically every 8 hours.
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="rounded-lg border bg-muted/30 p-3 text-sm">
          <p>
            <span className="font-medium">Slack bot:</span>{" "}
            {status?.slackConfigured
              ? status.slackAuthOk
                ? `Connected${status.slackTeam ? ` (${status.slackTeam})` : ""}`
                : `Configured but auth failed${status.slackError ? `: ${status.slackError}` : ""}`
              : "Not configured"}
          </p>
          <p className="mt-1">
            <span className="font-medium">Google Business Profile:</span>{" "}
            {status?.gbpConnected
              ? status.locationTitle ?? "Connected"
              : "Not connected"}
          </p>
          {!status?.slackConfigured ? (
            <p className="mt-2 text-muted-foreground">
              Add <code className="text-xs">{status?.envHints.join(", ")}</code> in Vercel. The bot
              needs <code className="text-xs">chat:write</code> and{" "}
              <code className="text-xs">files:write</code> scopes, and must be invited to your
              channel.
            </p>
          ) : null}
        </div>

        <label className="flex items-center gap-2 text-sm">
          <Checkbox checked={enabled} onCheckedChange={(value) => setEnabled(value === true)} />
          Enable Slack alerts for new Google reviews
        </label>

        <div className="space-y-2">
          <label className="text-sm font-medium" htmlFor="slack-channel-id">
            Slack channel ID
          </label>
          <Input
            id="slack-channel-id"
            value={channelId}
            onChange={(event) => setChannelId(event.target.value)}
            placeholder="C0123456789"
          />
          <p className="text-xs text-muted-foreground">
            In Slack: open the channel → channel details → copy the Channel ID at the bottom.
          </p>
        </div>

        {status?.bootstrapped ? (
          <p className="text-xs text-muted-foreground">
            Tracking {status.deliveredCount} reviews already seen. Only new reviews will be posted.
          </p>
        ) : null}

        <div className="flex flex-wrap gap-2">
          <Button type="button" onClick={() => void save()} disabled={saving}>
            {saving ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : null}
            Save
          </Button>
          <Button type="button" variant="outline" disabled={testing || !channelId} onClick={() => void sendTest()}>
            {testing ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : null}
            Send sample card
          </Button>
          <Button
            type="button"
            variant="outline"
            disabled={checking || !enabled}
            onClick={() => void checkNow()}
          >
            {checking ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-1 h-4 w-4" />}
            Check now
          </Button>
        </div>

        {!status?.gbpConnected ? (
          <p className="text-sm text-muted-foreground">
            <Link href="/settings/integrations/google-business" className="underline">
              Connect Google Business Profile
            </Link>{" "}
            first.
          </p>
        ) : null}
      </CardContent>
    </Card>
  );
}
