"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { FileText, History, Play } from "lucide-react";
import { CallHistoryIcon } from "@/components/voice/CallHistoryIcon";
import { CallDetailView } from "@/components/voice/CallDetailView";
import { Badge } from "@/components/ui/badge";
import { InboxCountOrb } from "@/components/layout/InboxCountOrb";
import { cn } from "@/lib/utils";
import type { CallHistoryDetail, CallHistoryListItem } from "@/lib/voice/call-history";
import {
  CALL_HISTORY_LIST_MAX_HEIGHT_CLASS,
  CALL_HISTORY_UI_LIMIT,
  formatCallDuration,
  formatCallTime,
  isRecentMissedInboundCall,
  remotePartyLabel,
} from "@/lib/voice/call-history";

type Props = {
  className?: string;
};

export function CsrCallHistoryPanel({ className }: Props) {
  const [calls, setCalls] = useState<CallHistoryListItem[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [filter, setFilter] = useState<"all" | "missed">("all");
  const [detail, setDetail] = useState<CallHistoryDetail | null>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const openedOnMissedRef = useRef(false);

  const missedCalls = useMemo(
    () => calls.filter((call) => isRecentMissedInboundCall(call)),
    [calls]
  );
  const visibleCalls = filter === "missed" ? missedCalls : calls;

  useEffect(() => {
    if (openedOnMissedRef.current || missedCalls.length === 0) return;
    openedOnMissedRef.current = true;
    setFilter("missed");
  }, [missedCalls.length]);

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
        "flex min-h-[36rem] flex-col overflow-hidden rounded-lg border border-border bg-card lg:flex-row",
        className
      )}
    >
      <div className="flex min-h-[18rem] min-w-0 flex-col border-b border-border lg:min-h-[36rem] lg:w-[34%] lg:border-b-0 lg:border-r">
        <div className="flex shrink-0 flex-col gap-2 border-b border-border px-4 py-3">
          <div className="flex items-center gap-2">
            <History className="h-4 w-4 text-muted-foreground" />
            <h3 className="font-semibold">Call history</h3>
            {calls.length > 0 ? (
              <span className="text-xs text-muted-foreground">
                ({calls.length}
                {calls.length >= CALL_HISTORY_UI_LIMIT ? "+" : ""})
              </span>
            ) : null}
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setFilter("all")}
              className={cn(
                "rounded-md px-2 py-1 text-xs font-medium",
                filter === "all" ? "bg-primary text-white" : "bg-muted text-muted-foreground"
              )}
            >
              All
            </button>
            <button
              type="button"
              onClick={() => setFilter("missed")}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-xs font-medium",
                filter === "missed" ? "bg-primary text-white" : "bg-muted text-muted-foreground"
              )}
            >
              Missed
              <InboxCountOrb count={missedCalls.length} />
            </button>
          </div>
          {missedCalls.length > 0 ? (
            <p className="text-[11px] text-muted-foreground">
              The sidebar count is missed inbound calls from the last 48 hours.
            </p>
          ) : null}
        </div>
        <div
          className={cn(
            "min-h-0 flex-1 overflow-y-auto overscroll-contain",
            CALL_HISTORY_LIST_MAX_HEIGHT_CLASS
          )}
        >
          {!visibleCalls.length ? (
            <p className="p-4 text-sm text-muted-foreground">
              {filter === "missed" ? "No missed inbound calls in the last 48 hours." : "No calls yet."}
            </p>
          ) : (
            <ul>
              {visibleCalls.map((call) => {
                const label = remotePartyLabel(
                  call.direction,
                  call.fromNumber,
                  call.toNumber,
                  call.customer?.name
                );
                const missed = isRecentMissedInboundCall(call);
                return (
                  <li key={call.id}>
                    <button
                      type="button"
                      onClick={() => setSelectedId(call.id)}
                      className={cn(
                        "flex w-full items-center gap-3 border-b border-border px-4 py-3 text-left transition-colors hover:bg-muted/40",
                        selectedId === call.id && "bg-highlight-panel",
                        missed && selectedId !== call.id && "bg-red-50/70"
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
                        {missed ? (
                          <Badge className="bg-[#FF3B30] text-[10px] text-white hover:bg-[#FF3B30]">
                            Missed
                          </Badge>
                        ) : null}
                        {call.hasVoicemail ? (
                          <Badge variant="outline" className="text-[10px]">
                            Voicemail
                          </Badge>
                        ) : null}
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

      <div className="flex min-h-[18rem] min-w-0 flex-1 flex-col overflow-hidden lg:min-h-[36rem] lg:w-[66%]">
        <div className="shrink-0 border-b border-border px-4 py-3">
          <h3 className="font-semibold">Call details</h3>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto">
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
