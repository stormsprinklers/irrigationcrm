"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Loader2, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

type Platform = "GOOGLE" | "META";
type StatusResponse = {
  counts: Array<{ platform: Platform; status: "PENDING" | "PROCESSING" | "SENT" | "FAILED"; _count: { _all: number } }>;
  recentFailures: Array<{
    id: string;
    platform: Platform;
    attempts: number;
    lastError: string | null;
    nextAttemptAt: string;
    event: { stage: string; occurredAt: string };
  }>;
};

export function PipelineConversionDeliveryPanel({ platform }: { platform: Platform }) {
  const [data, setData] = useState<StatusResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [requeueing, setRequeueing] = useState(false);

  const load = useCallback(async () => {
    const response = await fetch("/api/marketing/pipeline-conversions/status");
    if (!response.ok) throw new Error("Could not load conversion delivery status");
    setData((await response.json()) as StatusResponse);
  }, []);

  useEffect(() => {
    load()
      .catch((error) => toast.error(error instanceof Error ? error.message : "Could not load status"))
      .finally(() => setLoading(false));
  }, [load]);

  const counts = useMemo(() => {
    const result = { pending: 0, sent: 0, failed: 0 };
    for (const row of data?.counts ?? []) {
      if (row.platform !== platform) continue;
      if (row.status === "SENT") result.sent += row._count._all;
      else if (row.status === "FAILED") result.failed += row._count._all;
      else result.pending += row._count._all;
    }
    return result;
  }, [data, platform]);

  const failures = (data?.recentFailures ?? []).filter((row) => row.platform === platform);

  async function requeue() {
    setRequeueing(true);
    try {
      const response = await fetch("/api/marketing/pipeline-conversions/status", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ platform }),
      });
      const result = (await response.json()) as { error?: string; requeued?: number };
      if (!response.ok) throw new Error(result.error ?? "Could not retry conversions");
      toast.success(`${result.requeued ?? 0} conversion deliveries queued`);
      await load();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not retry conversions");
    } finally {
      setRequeueing(false);
    }
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between space-y-0">
        <div>
          <CardTitle className="text-base">Pipeline delivery status</CardTitle>
          <p className="mt-1 text-sm text-muted-foreground">
            Server-side conversion delivery; customers are never notified.
          </p>
        </div>
        <Button size="sm" variant="outline" disabled={loading} onClick={() => void load()}>
          <RefreshCw className={`mr-1 h-4 w-4 ${loading ? "animate-spin" : ""}`} />
          Refresh
        </Button>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap gap-2">
          <Badge variant="success">Sent {counts.sent}</Badge>
          <Badge variant="secondary">Pending {counts.pending}</Badge>
          <Badge variant={counts.failed ? "destructive" : "outline"}>Failed {counts.failed}</Badge>
        </div>
        {failures.length ? (
          <div className="space-y-2">
            {failures.slice(0, 5).map((failure) => (
              <div key={failure.id} className="rounded-md border p-3 text-xs">
                <p className="font-medium">{failure.event.stage} · attempt {failure.attempts}</p>
                <p className="mt-1 text-muted-foreground">{failure.lastError ?? "Delivery failed"}</p>
              </div>
            ))}
            <Button size="sm" variant="outline" disabled={requeueing} onClick={() => void requeue()}>
              {requeueing ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : null}
              Retry unsent conversions
            </Button>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">No recent delivery failures.</p>
        )}
      </CardContent>
    </Card>
  );
}
