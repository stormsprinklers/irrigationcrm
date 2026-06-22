"use client";

import { useCallback, useEffect, useState } from "react";
import { FileText, History, Play } from "lucide-react";
import { CallHistoryIcon } from "@/components/voice/CallHistoryIcon";
import { CallDetailView } from "@/components/voice/CallDetailView";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { CallHistoryDetail, CallHistoryListItem } from "@/lib/voice/call-history";
import { formatCallDuration, formatCallTime, remotePartyLabel } from "@/lib/voice/call-history";

export function CsrCallHistoryPanel() {
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
    <section className="grid h-[min(70vh,640px)] min-h-[360px] grid-rows-2 overflow-hidden rounded-lg border border-border bg-white lg:grid-cols-5 lg:grid-rows-1">
      <div className="flex min-h-0 flex-col overflow-hidden border-b border-border lg:col-span-2 lg:border-b-0 lg:border-r">
        <div className="flex shrink-0 items-center gap-2 border-b border-border px-4 py-3">
          <History className="h-4 w-4 text-muted-foreground" />
          <h3 className="font-semibold">Call history</h3>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
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

      <div className="flex min-h-0 flex-col overflow-hidden lg:col-span-3">
        <div className="shrink-0 border-b border-border px-4 py-3">
          <h3 className="font-semibold">Call details</h3>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
          {!selectedId ? (
            <p className="p-4 text-sm text-muted-foreground">Select a call to play recording or read transcript.</p>
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
