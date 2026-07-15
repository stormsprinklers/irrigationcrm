"use client";

import { useCallback, useEffect, useState } from "react";
import { FileText, History, Play } from "lucide-react";
import { CallHistoryIcon } from "@/components/voice/CallHistoryIcon";
import { CallDetailView } from "@/components/voice/CallDetailView";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { CallHistoryDetail, CallHistoryListItem } from "@/lib/voice/call-history";
import { formatCallDuration, formatCallTime, remotePartyLabel } from "@/lib/voice/call-history";

type Props = {
  className?: string;
};

export function CsrCallHistoryPanel({ className }: Props) {
  const [calls, setCalls] = useState<CallHistoryListItem[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<CallHistoryDetail | null>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);

  const loadHistory = useCallback(() => {
    fetch("/api/voice/calls/history")
      .then((r) => r.json())
      .then((data) => setCalls(data.calls ?? []))
      .catch(() => {});
  }, []);

  useEffect(() => {
    loadHistory();
    const timer = setInterval(loadHistory, 15000);
    return () => clearInterval(timer);
  }, [loadHistory]);

  useEffect(() => {
    if (!selectedId) {
      setDetail(null);
      return;
    }
    setLoadingDetail(true);
    fetch(`/api/voice/calls/history/${selectedId}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => setDetail(data))
      .catch(() => setDetail(null))
      .finally(() => setLoadingDetail(false));
  }, [selectedId]);

  return (
    <section
      className={cn(
        "flex min-h-[36rem] flex-col overflow-visible rounded-lg border border-border bg-card lg:flex-row",
        className
      )}
    >
      <div className="flex min-h-[18rem] min-w-0 flex-col border-b border-border lg:min-h-[36rem] lg:w-[34%] lg:border-b-0 lg:border-r">
        <div className="flex shrink-0 items-center gap-2 border-b border-border px-4 py-3">
          <History className="h-4 w-4 text-muted-foreground" />
          <h3 className="font-semibold">Call history</h3>
          {calls.length > 0 ? (
            <span className="text-xs text-muted-foreground">({calls.length})</span>
          ) : null}
        </div>
        <div className="flex-1">
          {!calls.length ? (
            <p className="p-4 text-sm text-muted-foreground">No calls yet.</p>
          ) : (
            <ul>
              {calls.map((call) => {
                const label = remotePartyLabel(
                  call.direction,
                  call.fromNumber,
                  call.toNumber,
                  call.customer?.name
                );
                return (
                  <li key={call.id}>
                    <button
                      type="button"
                      onClick={() => setSelectedId(call.id)}
                      className={cn(
                        "flex w-full items-center gap-3 border-b border-border px-4 py-3 text-left transition-colors hover:bg-muted/40",
                        selectedId === call.id && "bg-highlight-panel"
                      )}
                    >
                      <CallHistoryIcon direction={call.direction} answered={call.answered} />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium">{label}</p>
                        <p className="text-xs text-muted-foreground">
                          {formatCallTime(call.startedAt)}
                          {call.durationSec ? ` · ${formatCallDuration(call.durationSec)}` : ""}
                        </p>
                      </div>
                      <div className="flex shrink-0 flex-col items-end gap-1">
                        {call.hasRecording ? (
                          <Badge variant="outline" className="text-[10px]">
                            <Play className="mr-1 h-3 w-3" />
                            Rec
                          </Badge>
                        ) : null}
                        {call.hasTranscript ? (
                          <Badge variant="outline" className="text-[10px]">
                            <FileText className="mr-1 h-3 w-3" />
                            Text
                          </Badge>
                        ) : null}
                      </div>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>

      <div className="flex min-h-[18rem] min-w-0 flex-1 flex-col lg:min-h-[36rem] lg:w-[66%]">
        <div className="shrink-0 border-b border-border px-4 py-3">
          <h3 className="font-semibold">Call details</h3>
        </div>
        <div className="flex-1">
          {!selectedId ? (
            <p className="p-4 text-sm text-muted-foreground">
              Select a call to play recording or read transcript.
            </p>
          ) : loadingDetail ? (
            <p className="p-4 text-sm text-muted-foreground">Loading…</p>
          ) : !detail ? (
            <p className="p-4 text-sm text-muted-foreground">Call not found.</p>
          ) : (
            <div className="p-4">
              <CallDetailView detail={detail} />
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
