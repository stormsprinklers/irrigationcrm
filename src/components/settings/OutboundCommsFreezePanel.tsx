"use client";

import { useEffect, useState } from "react";
import { AlertTriangle, Ban, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";

type FreezeStatus = {
  disabled: boolean;
  reason: string | null;
  disabledAt: string | null;
  disabledByName: string | null;
  canManage: boolean;
};

const DEFAULT_REASON =
  "We are finishing setup of our system. No automated texts, calls, or emails are being sent right now.";

export function OutboundCommsFreezePanel() {
  const [status, setStatus] = useState<FreezeStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [reason, setReason] = useState("");

  useEffect(() => {
    fetch("/api/settings/communications-freeze")
      .then((r) => r.json())
      .then((data: FreezeStatus) => {
        setStatus(data);
        setReason(data.reason ?? DEFAULT_REASON);
      })
      .catch(() => toast.error("Failed to load communication controls"))
      .finally(() => setLoading(false));
  }, []);

  async function update(disabled: boolean) {
    setSaving(true);
    try {
      const res = await fetch("/api/settings/communications-freeze", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ disabled, reason: disabled ? reason : undefined }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to update");
      setStatus(data);
      setReason(data.reason ?? DEFAULT_REASON);
      toast.success(
        disabled
          ? "Outbound communications paused"
          : "Outbound communications resumed"
      );
      window.dispatchEvent(new Event("outbound-comms-changed"));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Update failed");
    } finally {
      setSaving(false);
    }
  }

  if (loading || !status) {
    return (
      <div className="rounded-lg border bg-card p-4">
        <p className="text-sm text-muted-foreground">Loading communication controls…</p>
      </div>
    );
  }

  const paused = status.disabled;

  return (
    <div
      className={`rounded-lg border p-4 ${
        paused ? "border-destructive/40 bg-destructive/5" : "bg-card"
      }`}
    >
      <div className="flex items-start gap-3">
        <div className={paused ? "text-destructive" : "text-emerald-600"}>
          {paused ? <Ban className="h-5 w-5" /> : <CheckCircle2 className="h-5 w-5" />}
        </div>
        <div className="flex-1 space-y-1">
          <h2 className="text-base font-semibold">Outbound communications</h2>
          <p className="text-sm text-muted-foreground">
            When paused, the CRM will not send any texts, place any phone calls, or send any
            emails to customers. Staff using messaging or calling features will see an
            explanation. Use this while setting up or testing so nothing reaches customers by
            accident.
          </p>
        </div>
        <span
          className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-medium ${
            paused
              ? "bg-destructive/15 text-destructive"
              : "bg-emerald-500/15 text-emerald-600"
          }`}
        >
          {paused ? "Paused" : "Active"}
        </span>
      </div>

      {paused ? (
        <div className="mt-4 rounded-md border border-destructive/30 bg-background/60 p-3 text-sm">
          <div className="flex items-center gap-2 font-medium text-destructive">
            <AlertTriangle className="h-4 w-4" />
            All outbound texts, calls, and emails are currently blocked.
          </div>
          {status.reason ? (
            <p className="mt-1 text-muted-foreground">Reason shown to staff: “{status.reason}”</p>
          ) : null}
          {status.disabledByName || status.disabledAt ? (
            <p className="mt-1 text-xs text-muted-foreground">
              Paused
              {status.disabledByName ? ` by ${status.disabledByName}` : ""}
              {status.disabledAt
                ? ` on ${new Date(status.disabledAt).toLocaleString()}`
                : ""}
              .
            </p>
          ) : null}
        </div>
      ) : null}

      {status.canManage ? (
        <div className="mt-4 space-y-3">
          {!paused ? (
            <div className="space-y-1">
              <label className="text-sm font-medium">Message shown to staff while paused</label>
              <Input
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder={DEFAULT_REASON}
              />
              <p className="text-xs text-muted-foreground">
                This appears in the error anyone sees when they try to send a message or place a
                call.
              </p>
            </div>
          ) : null}

          <Button
            variant={paused ? "default" : "destructive"}
            disabled={saving}
            onClick={() => update(!paused)}
          >
            {saving
              ? "Saving…"
              : paused
                ? "Resume outbound communications"
                : "Pause all outbound communications"}
          </Button>
        </div>
      ) : (
        <p className="mt-4 text-xs text-muted-foreground">
          Only administrators can change this setting.
        </p>
      )}
    </div>
  );
}
