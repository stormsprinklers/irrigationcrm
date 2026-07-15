"use client";

import { useCallback, useEffect, useState } from "react";
import { User } from "lucide-react";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { CallRecordingPlayer } from "@/components/voice/CallRecordingPlayer";
import { CallTranscriptPanel } from "@/components/voice/CallTranscriptPanel";
import type { CallHistoryDetail } from "@/lib/voice/call-history";
import { formatCallDateTime, formatCallDuration } from "@/lib/voice/call-history";

type Props = { customerId: string };

export function CustomerCallsTab({ customerId }: Props) {
  const [calls, setCalls] = useState<CallHistoryDetail[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    const res = await fetch(`/api/customers/${customerId}/calls`);
    if (!res.ok) throw new Error("Failed to load calls");
    const data = await res.json();
    setCalls(data.calls ?? []);
  }, [customerId]);

  useEffect(() => {
    load()
      .catch(() => toast.error("Failed to load calls"))
      .finally(() => setLoading(false));
  }, [load]);

  if (loading) {
    return <p className="text-sm text-muted-foreground">Loading calls…</p>;
  }

  if (!calls.length) {
    return (
      <Card>
        <CardContent className="py-8">
          <p className="text-sm text-muted-foreground">No calls linked to this customer yet.</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {calls.map((call) => (
        <Card key={call.id}>
          <CardHeader className="pb-2">
            <CardTitle className="flex flex-wrap items-center gap-x-3 gap-y-1 text-base font-semibold">
              <span>{formatCallDateTime(call.startedAt)}</span>
              <span className="text-sm font-normal text-muted-foreground">
                {call.direction === "INBOUND" ? "Inbound" : "Outbound"}
                {call.durationSec ? ` · ${formatCallDuration(call.durationSec)}` : ""}
              </span>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center gap-1.5 text-sm">
              <User className="h-3.5 w-3.5 text-muted-foreground" />
              <span className="text-muted-foreground">Employee:</span>
              <span className="font-medium">{call.employee?.name ?? "—"}</span>
            </div>

            <div>
              <p className="mb-1 text-sm font-medium">Summary</p>
              {call.aiSummary?.trim() ? (
                <p className="text-sm leading-relaxed">{call.aiSummary}</p>
              ) : (
                <p className="text-sm text-muted-foreground">No summary yet.</p>
              )}
            </div>

            <div>
              <p className="mb-2 text-sm font-medium">Recording</p>
              {call.hasRecording ? (
                <CallRecordingPlayer
                  callId={call.id}
                  playbackUrl={call.recordingPlaybackUrl}
                />
              ) : (
                <p className="text-sm text-muted-foreground">No recording available.</p>
              )}
            </div>

            <div>
              <p className="mb-2 text-sm font-medium">Transcript</p>
              <CallTranscriptPanel
                callId={call.id}
                transcript={call.transcript}
                hasRecording={call.hasRecording}
                onTranscribed={() => void load()}
              />
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
