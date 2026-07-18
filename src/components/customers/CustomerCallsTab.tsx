"use client";

import { useCallback, useEffect, useState } from "react";
import { ChevronDown, PhoneIncoming, PhoneOutgoing, User } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { CallRecordingPlayer } from "@/components/voice/CallRecordingPlayer";
import { CallTranscriptPanel } from "@/components/voice/CallTranscriptPanel";
import type { CallHistoryDetail } from "@/lib/voice/call-history";
import { formatCallDateTime, formatCallDuration } from "@/lib/voice/call-history";
import { cn } from "@/lib/utils";

type Props = { customerId: string };

function employeeLabel(call: CallHistoryDetail) {
  if (call.employee?.name) return call.employee.name;
  if (call.isAiAgent) return "AI Agent";
  return "—";
}

export function CustomerCallsTab({ customerId }: Props) {
  const [calls, setCalls] = useState<CallHistoryDetail[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);

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
    <div className="space-y-2">
      {calls.map((call) => {
        const open = expandedId === call.id;
        const inbound = call.direction === "INBOUND";
        return (
          <Card key={call.id} className="overflow-hidden">
            <button
              type="button"
              className="flex w-full items-start gap-3 px-4 py-3 text-left hover:bg-muted/40"
              onClick={() => setExpandedId(open ? null : call.id)}
              aria-expanded={open}
            >
              <ChevronDown
                className={cn(
                  "mt-0.5 h-4 w-4 shrink-0 text-muted-foreground transition-transform",
                  open && "rotate-180"
                )}
              />
              <div className="min-w-0 flex-1 space-y-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-sm font-semibold">{formatCallDateTime(call.startedAt)}</span>
                  <Badge variant="outline" className="gap-1 font-normal">
                    {inbound ? (
                      <PhoneIncoming className="h-3 w-3" />
                    ) : (
                      <PhoneOutgoing className="h-3 w-3" />
                    )}
                    {inbound ? "Inbound" : "Outbound"}
                  </Badge>
                  {call.durationSec ? (
                    <span className="text-xs text-muted-foreground">
                      {formatCallDuration(call.durationSec)}
                    </span>
                  ) : null}
                </div>
                <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
                  <User className="h-3.5 w-3.5 shrink-0" />
                  <span>{employeeLabel(call)}</span>
                  {!open && call.aiSummary?.trim() ? (
                    <span className="truncate">· {call.aiSummary.trim()}</span>
                  ) : null}
                </div>
              </div>
            </button>

            {open ? (
              <CardContent className="space-y-4 border-t pt-4">
                <div className="flex items-center gap-1.5 text-sm">
                  <User className="h-3.5 w-3.5 text-muted-foreground" />
                  <span className="text-muted-foreground">Employee:</span>
                  <span className="font-medium">{employeeLabel(call)}</span>
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
            ) : null}
          </Card>
        );
      })}
    </div>
  );
}
