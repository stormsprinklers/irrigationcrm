"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { FileText, History, Loader2, Play, Search, X } from "lucide-react";
import { CallHistoryIcon } from "@/components/voice/CallHistoryIcon";
import { CallDetailView } from "@/components/voice/CallDetailView";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { InboxCountOrb } from "@/components/layout/InboxCountOrb";
import { InboxListDetailShell } from "@/components/inbox/InboxListDetailShell";
import { notifyInboxBadgesChanged } from "@/contexts/InboxBadgesProvider";
import { cn } from "@/lib/utils";
import { formatPhoneDisplay } from "@/lib/inbox/phone";
import type { CallHistoryDetail, CallHistoryListItem } from "@/lib/voice/call-history";
import {
  CALL_HISTORY_LIST_MAX_HEIGHT_CLASS,
  CALL_HISTORY_UI_LIMIT,
  formatCallDuration,
  formatCallTime,
  isUnreviewedMissedInboundCall,
  remotePartyLabel,
  remotePartyNumber,
} from "@/lib/voice/call-history";

type Props = {
  className?: string;
};

export function CsrCallHistoryPanel({ className }: Props) {
  const [calls, setCalls] = useState<CallHistoryListItem[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [filter, setFilter] = useState<"all" | "missed">("all");
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [historyLoading, setHistoryLoading] = useState(false);
  const [detail, setDetail] = useState<CallHistoryDetail | null>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const openedOnMissedRef = useRef(false);
  const historyRequestRef = useRef(0);

  const [clearing, setClearing] = useState(false);

  const missedCalls = useMemo(
    () => calls.filter((call) => isUnreviewedMissedInboundCall(call)),
    [calls]
  );
  const visibleCalls = filter === "missed" ? missedCalls : calls;

  useEffect(() => {
    if (debouncedSearch || openedOnMissedRef.current || missedCalls.length === 0) return;
    openedOnMissedRef.current = true;
    setFilter("missed");
  }, [debouncedSearch, missedCalls.length]);

  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedSearch(search.trim()), 250);
    return () => window.clearTimeout(timer);
  }, [search]);

  const loadHistory = useCallback(() => {
    const requestId = ++historyRequestRef.current;
    const params = new URLSearchParams();
    if (debouncedSearch) params.set("q", debouncedSearch);
    setHistoryLoading(true);
    fetch(`/api/voice/calls/history${params.size ? `?${params.toString()}` : ""}`)
      .then((r) => r.json())
      .then((data) => {
        if (requestId === historyRequestRef.current) setCalls(data.calls ?? []);
      })
      .catch(() => {})
      .finally(() => {
        if (requestId === historyRequestRef.current) setHistoryLoading(false);
      });
  }, [debouncedSearch]);

  async function markCallReviewed(id: string) {
    const call = calls.find((c) => c.id === id);
    if (!call || !isUnreviewedMissedInboundCall(call)) return;
    const now = new Date().toISOString();
    setCalls((prev) =>
      prev.map((c) => (c.id === id ? { ...c, missedReviewedAt: now } : c))
    );
    try {
      const res = await fetch(`/api/voice/calls/history/${id}/review`, { method: "POST" });
      if (!res.ok) throw new Error("review failed");
      notifyInboxBadgesChanged();
    } catch {
      loadHistory();
    }
  }

  async function clearAllMissed() {
    if (clearing || missedCalls.length === 0) return;
    setClearing(true);
    try {
      const res = await fetch("/api/voice/calls/history/review-missed", { method: "POST" });
      if (!res.ok) throw new Error("clear failed");
      const now = new Date().toISOString();
      setCalls((prev) =>
        prev.map((c) =>
          isUnreviewedMissedInboundCall(c) ? { ...c, missedReviewedAt: now } : c
        )
      );
      notifyInboxBadgesChanged();
    } finally {
      setClearing(false);
      loadHistory();
    }
  }

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

  const filterChrome = (
    <div className="flex flex-col gap-2">
      <div className="relative">
        <Search
          className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
          aria-hidden
        />
        <Input
          type="search"
          value={search}
          onChange={(event) => {
            setSearch(event.target.value);
            setFilter("all");
          }}
          placeholder="Search customer, phone, or employee"
          aria-label="Search call history"
          className="h-9 pl-8 pr-16"
        />
        <div className="absolute right-2 top-1/2 flex -translate-y-1/2 items-center gap-1">
          {historyLoading ? (
            <Loader2
              className="h-3.5 w-3.5 animate-spin text-muted-foreground"
              aria-label="Searching"
            />
          ) : null}
          {search ? (
            <button
              type="button"
              className="rounded p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground"
              aria-label="Clear call search"
              onClick={() => setSearch("")}
            >
              <X className="h-3.5 w-3.5" />
            </button>
          ) : null}
        </div>
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
        {missedCalls.length > 0 ? (
          <Button
            type="button"
            size="sm"
            variant="ghost"
            className="ml-auto h-7 text-xs"
            disabled={clearing}
            onClick={() => void clearAllMissed()}
          >
            {clearing ? "Clearing…" : "Clear missed"}
          </Button>
        ) : null}
      </div>
      {missedCalls.length > 0 ? (
        <p className="text-[11px] text-muted-foreground">
          The sidebar count is unreviewed missed inbound calls from the last 48 hours. Open a
          call or use Clear missed to dismiss the badge.
        </p>
      ) : null}
    </div>
  );

  const callList = (
    <div
      className={cn(
        "min-h-0 flex-1 overflow-y-auto overscroll-contain md:overflow-y-auto",
        CALL_HISTORY_LIST_MAX_HEIGHT_CLASS
      )}
    >
      {!visibleCalls.length ? (
        <p className="p-4 text-sm text-muted-foreground">
          {debouncedSearch
            ? `No calls found for “${debouncedSearch}”.`
            : filter === "missed"
              ? "No unreviewed missed inbound calls in the last 48 hours."
              : "No calls yet."}
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
            const missed = isUnreviewedMissedInboundCall(call);
            return (
              <li key={call.id}>
                <div
                  role="button"
                  tabIndex={0}
                  onClick={() => {
                    setSelectedId(call.id);
                    void markCallReviewed(call.id);
                  }}
                  onKeyDown={(event) => {
                    if (event.target !== event.currentTarget) return;
                    if (event.key !== "Enter" && event.key !== " ") return;
                    event.preventDefault();
                    setSelectedId(call.id);
                    void markCallReviewed(call.id);
                  }}
                  className={cn(
                    "flex w-full cursor-pointer items-center gap-3 border-b border-border px-4 py-3 text-left transition-colors hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-inset",
                    selectedId === call.id && "bg-highlight-panel",
                    missed && selectedId !== call.id && "bg-red-50/70"
                  )}
                >
                  <CallHistoryIcon direction={call.direction} answered={call.answered} />
                  <div className="min-w-0 flex-1">
                    {call.customer?.id ? (
                      <Link
                        href={`/customers/${call.customer.id}`}
                        onClick={(event) => event.stopPropagation()}
                        className="block truncate rounded-sm text-sm font-medium hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                        aria-label={`View ${call.customer.name}'s customer profile`}
                      >
                        {label}
                      </Link>
                    ) : (
                      <p className="truncate text-sm font-medium">{label}</p>
                    )}
                    <p className="text-xs text-muted-foreground">
                      {formatPhoneDisplay(
                        remotePartyNumber(call.direction, call.fromNumber, call.toNumber)
                      )}
                      {` · ${formatCallTime(call.startedAt)}`}
                      {call.durationSec ? ` · ${formatCallDuration(call.durationSec)}` : ""}
                    </p>
                  </div>
                  <div className="flex shrink-0 flex-col items-end gap-1">
                    {missed ? (
                      <Badge className="bg-[#FF3B30] text-[10px] text-white hover:bg-[#FF3B30]">
                        Missed
                      </Badge>
                    ) : null}
                    {call.isSpam ? (
                      <Badge variant="destructive" className="text-[10px]">
                        Spam
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
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );

  const callDetail = (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="hidden shrink-0 border-b border-border px-4 py-3 md:block">
        <h3 className="font-semibold">Call details</h3>
      </div>
      <div className="min-h-0 flex-1">
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
            <CallDetailView
              detail={detail}
              onUpdated={(next) => {
                setDetail(next);
                setCalls((current) =>
                  current.map((call) =>
                    call.id === next.id
                      ? {
                          ...call,
                          hasSummary: next.hasSummary,
                          objectionCategory: next.objectionCategory,
                          objectionReason: next.objectionReason,
                          isSpam: next.isSpam,
                          missedReviewedAt: next.missedReviewedAt,
                        }
                      : call
                  )
                );
              }}
            />
          </div>
        )}
      </div>
    </div>
  );

  return (
    <section
      className={cn(
        "flex min-h-[36rem] flex-col overflow-hidden rounded-lg border border-border bg-card",
        className
      )}
    >
      <InboxListDetailShell
        className="min-h-0 flex-1"
        listFirst
        listLabel="Call history"
        selectedId={selectedId}
        onMobileBack={() => setSelectedId(null)}
        detailScroll="page"
        chrome={
          <div className="flex flex-col gap-2">
            <div className="flex items-center gap-2">
              <History className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm font-semibold">Call history</span>
              {calls.length > 0 ? (
                <span className="text-xs text-muted-foreground">
                  ({calls.length}
                  {calls.length >= CALL_HISTORY_UI_LIMIT ? "+" : ""})
                </span>
              ) : null}
              {debouncedSearch ? (
                <span className="truncate text-xs text-muted-foreground" title={debouncedSearch}>
                  for “{debouncedSearch}”
                </span>
              ) : null}
            </div>
            {filterChrome}
          </div>
        }
        list={callList}
        detail={callDetail}
      />
    </section>
  );
}
