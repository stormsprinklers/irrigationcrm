"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { History, User } from "lucide-react";
import { CallHistoryIcon } from "@/components/voice/CallHistoryIcon";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import type { CallHistoryDetail, CallHistoryListItem } from "@/lib/voice/call-history";
import {
  formatCallDateTime,
  formatCallDuration,
  formatCallTime,
  remotePartyLabel,
} from "@/lib/voice/call-history";

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
    <section className="grid min-h-[360px] gap-4 rounded-lg border border-border bg-white lg:grid-cols-5">
      <div className="flex flex-col border-b border-border lg:col-span-2 lg:border-b-0 lg:border-r">
        <div className="flex items-center gap-2 border-b border-border px-4 py-3">
          <History className="h-4 w-4 text-muted-foreground" />
          <h3 className="font-semibold">Call history</h3>
        </div>
        <ScrollArea className="h-80 lg:h-[320px]">
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
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </ScrollArea>
      </div>

      <div className="flex flex-col lg:col-span-3">
        <div className="border-b border-border px-4 py-3">
          <h3 className="font-semibold">Call details</h3>
        </div>
        <ScrollArea className="h-80 lg:h-[320px]">
          {!selectedId ? (
            <p className="p-4 text-sm text-muted-foreground">Select a call to view details.</p>
          ) : loadingDetail ? (
            <p className="p-4 text-sm text-muted-foreground">Loading…</p>
          ) : !detail ? (
            <p className="p-4 text-sm text-muted-foreground">Call not found.</p>
          ) : (
            <div className="space-y-4 p-4">
              <div className="flex items-start gap-3">
                <CallHistoryIcon direction={detail.direction} answered={detail.answered} />
                <div>
                  <p className="font-semibold">
                    {remotePartyLabel(
                      detail.direction,
                      detail.fromNumber,
                      detail.toNumber,
                      detail.customer?.name
                    )}
                  </p>
                  {detail.customer?.id ? (
                    <Link
                      href={`/customers/${detail.customer.id}`}
                      className="text-sm text-primary hover:underline"
                    >
                      View customer
                    </Link>
                  ) : null}
                </div>
              </div>

              <dl className="grid gap-3 text-sm sm:grid-cols-2">
                <div>
                  <dt className="text-muted-foreground">Date & time</dt>
                  <dd className="font-medium">{formatCallDateTime(detail.startedAt)}</dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">Duration</dt>
                  <dd className="font-medium">{formatCallDuration(detail.durationSec)}</dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">Employee</dt>
                  <dd className="flex items-center gap-1.5 font-medium">
                    <User className="h-3.5 w-3.5 text-muted-foreground" />
                    {detail.handledBy?.name ?? detail.employee?.name ?? "—"}
                  </dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">Phone</dt>
                  <dd className="font-medium">
                    {detail.direction === "INBOUND" ? detail.fromNumber : detail.toNumber}
                  </dd>
                </div>
              </dl>

              {detail.recordingUrl ? (
                <div>
                  <p className="mb-2 text-sm font-medium">Recording</p>
                  <audio controls className="w-full" src={detail.recordingUrl}>
                    <track kind="captions" />
                  </audio>
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">No recording available.</p>
              )}

              {detail.transcript ? (
                <div>
                  <p className="mb-2 text-sm font-medium">Transcript</p>
                  <div className="max-h-40 overflow-y-auto rounded-md border border-border bg-muted/20 p-3">
                    <p className="whitespace-pre-wrap text-sm leading-relaxed text-muted-foreground">
                      {detail.transcript}
                    </p>
                  </div>
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">No transcript available.</p>
              )}
            </div>
          )}
        </ScrollArea>
      </div>
    </section>
  );
}
