"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Loader2, Send } from "lucide-react";
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
  deliveredCount: number;
  hasDeliveryHistory: boolean;
  slackError: string | null;
};

export function SlackGbpReviewsPanel() {
  const [status, setStatus] = useState<SlackGbpReviewsStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [sending, setSending] = useState(false);
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
      toast.success("Slack review settings saved");
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

  async function sendReviews() {
    setSending(true);
    try {
      const res = await fetch("/api/settings/slack/gbp-reviews", { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? data.errors?.[0] ?? "Send failed");

      if (data.skipped === "slack_not_configured") {
        toast.error("Slack is not configured on the server");
        return;
      }
      if (data.skipped === "channel_not_configured") {
        toast.error("Save a Slack channel ID first");
        return;
      }
      if (data.skipped === "gbp_not_connected") {
        toast.error("Connect Google Business Profile first");
        return;
      }

      if (data.posted > 0) {
        const parts = [
          `Sent ${data.posted} review${data.posted === 1 ? "" : "s"} in ${data.messages} Slack message${data.messages === 1 ? "" : "s"}`,
        ];
        if (data.remaining > 0) {
          parts.push(`${data.remaining} more unsent — click Send again`);
        }
        toast.success(parts.join(". "));
      } else if (data.firstSend) {
        toast.message("No Google reviews from the last 24 hours to send");
      } else {
        toast.message("No new unsent reviews to post to Slack");
      }

      if (data.errors?.length) {
        toast.error(data.errors[0]);
      }

      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Send failed");
    } finally {
      setSending(false);
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
          Send designed review cards to Slack on demand. Each Slack message can include up to six
          review images; larger batches are split across multiple messages. Reviews already sent are
          tracked so they are not posted again.
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
          Enable Google review Slack sharing
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
            In Slack: open the channel → channel details → copy the Channel ID at the bottom (starts
            with <code className="text-xs">C</code>, <code className="text-xs">G</code>, or{" "}
            <code className="text-xs">D</code> — not a user ID starting with U).
          </p>
        </div>

        <p className="text-xs text-muted-foreground">
          {status?.hasDeliveryHistory
            ? `${status.deliveredCount} reviews already sent to Slack. Send will post any newer reviews not yet shared.`
            : "First send includes Google reviews from the last 24 hours only. After that, any unsent reviews are eligible."}
        </p>

        <div className="flex flex-wrap gap-2">
          <Button type="button" onClick={() => void save()} disabled={saving}>
            {saving ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : null}
            Save
          </Button>
          <Button
            type="button"
            variant="default"
            disabled={sending || !channelId || !status?.gbpConnected}
            onClick={() => void sendReviews()}
          >
            {sending ? (
              <Loader2 className="mr-1 h-4 w-4 animate-spin" />
            ) : (
              <Send className="mr-1 h-4 w-4" />
            )}
            Send reviews to Slack
          </Button>
          <Button
            type="button"
            variant="outline"
            disabled={testing || !channelId}
            onClick={() => void sendTest()}
          >
            {testing ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : null}
            Send sample card
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
