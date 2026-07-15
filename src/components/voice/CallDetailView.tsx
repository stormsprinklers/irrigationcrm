"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { User } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { CallHistoryIcon } from "@/components/voice/CallHistoryIcon";
import { CallRecordingPlayer } from "@/components/voice/CallRecordingPlayer";
import { CallTranscriptPanel } from "@/components/voice/CallTranscriptPanel";
import type { CallHistoryDetail } from "@/lib/voice/call-history";
import {
  formatCallDateTime,
  formatCallDuration,
  remotePartyLabel,
} from "@/lib/voice/call-history";

type VisitOption = { id: string; title: string; startAt: string };

export function CallDetailView({
  detail: initialDetail,
  onUpdated,
}: {
  detail: CallHistoryDetail;
  onUpdated?: (detail: CallHistoryDetail) => void;
}) {
  const [detail, setDetail] = useState(initialDetail);
  const [summarizing, setSummarizing] = useState(false);
  const [visits, setVisits] = useState<VisitOption[]>([]);
  const [selectedVisitId, setSelectedVisitId] = useState("");
  const [linking, setLinking] = useState(false);

  useEffect(() => {
    setDetail(initialDetail);
  }, [initialDetail]);

  const staffDisplay = useMemo(() => {
    const named = (detail.participants ?? []).filter(
      (p) => p.name && p.name !== "Unknown"
    );
    if (named.length) return named;
    if (detail.employee?.name) {
      return [
        {
          id: detail.employee.id,
          name: detail.employee.name,
          role: "ANSWERED",
          phoneE164: null as string | null,
          joinedAt: "",
        },
      ];
    }
    return [];
  }, [detail.participants, detail.employee]);

  useEffect(() => {
    if (!detail.customer?.id) {
      setVisits([]);
      return;
    }
    fetch(`/api/customers/${detail.customer.id}/history`)
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        const list = data?.visits;
        if (!Array.isArray(list)) return;
        setVisits(
          list.map((v: { id: string; title: string; startAt: string }) => ({
            id: v.id,
            title: v.title,
            startAt: v.startAt,
          }))
        );
      })
      .catch(() => {});
  }, [detail.customer?.id]);

  async function regenerateSummary(force = true) {
    setSummarizing(true);
    try {
      const res = await fetch(`/api/voice/calls/history/${detail.id}/summarize`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ force }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Summary failed");
      const next = { ...detail, aiSummary: data.summary ?? null, hasSummary: Boolean(data.summary) };
      setDetail(next);
      onUpdated?.(next);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Summary failed");
    } finally {
      setSummarizing(false);
    }
  }

  async function handleTranscribed(transcript: string) {
    const next = { ...detail, transcript, hasTranscript: true };
    setDetail(next);
    onUpdated?.(next);
    // Summary is generated server-side during transcribe; refresh detail.
    try {
      const res = await fetch(`/api/voice/calls/history/${detail.id}`);
      if (res.ok) {
        const fresh = (await res.json()) as CallHistoryDetail;
        setDetail(fresh);
        onUpdated?.(fresh);
      } else if (!detail.aiSummary) {
        await regenerateSummary(false);
      }
    } catch {
      // ignore
    }
  }

  async function linkToJob() {
    if (!selectedVisitId) {
      toast.error("Select a job first");
      return;
    }
    setLinking(true);
    try {
      const bodyText =
        detail.aiSummary?.trim() ||
        "Call linked to this job. See recording and transcript below.";
      const res = await fetch(`/api/visits/${selectedVisitId}/notes`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body: bodyText, callLogId: detail.id }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Failed to link call");
      toast.success("Call linked to job notes");
      setDetail({ ...detail, visitId: selectedVisitId });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to link call");
    } finally {
      setLinking(false);
    }
  }

  return (
    <div className="space-y-5">
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
            <Link href={`/customers/${detail.customer.id}`} className="text-sm text-primary hover:underline">
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
          <dt className="text-muted-foreground">
            {staffDisplay.length > 1 ? "Employees" : "Employee"}
          </dt>
          <dd className="font-medium">
            {staffDisplay.length ? (
              <ul className="space-y-1">
                {staffDisplay.map((p) => (
                  <li key={`${p.id}-${p.role}-${p.joinedAt || p.name}`} className="flex items-center gap-1.5">
                    <User className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                    <span>
                      {p.name}
                      {p.joinedAt ? (
                        <span className="text-xs font-normal text-muted-foreground">
                          {" "}
                          ·{" "}
                          {p.role === "ANSWERED"
                            ? "answered"
                            : p.role === "EXTERNAL_TRANSFER"
                              ? "phone transfer"
                              : "transferred"}
                          {p.phoneE164 ? ` · ${p.phoneE164}` : ""}
                        </span>
                      ) : null}
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <span className="flex items-center gap-1.5">
                <User className="h-3.5 w-3.5 text-muted-foreground" />
                —
              </span>
            )}
          </dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Phone</dt>
          <dd className="font-medium">
            {detail.direction === "INBOUND" ? detail.fromNumber : detail.toNumber}
          </dd>
        </div>
      </dl>

      <div>
        <div className="mb-2 flex items-center justify-between gap-2">
          <p className="text-sm font-medium">Summary</p>
          {detail.hasTranscript || detail.transcript?.trim() ? (
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={summarizing}
              onClick={() => void regenerateSummary(true)}
            >
              {summarizing ? "Generating…" : detail.aiSummary ? "Regenerate" : "Generate summary"}
            </Button>
          ) : null}
        </div>
        {detail.aiSummary?.trim() ? (
          <p className="rounded-md border border-border bg-muted/20 p-3 text-sm leading-relaxed text-foreground">
            {detail.aiSummary}
          </p>
        ) : (
          <p className="text-sm text-muted-foreground">
            {detail.hasTranscript || detail.transcript?.trim()
              ? "No summary yet."
              : "Summary appears after a transcript is available."}
          </p>
        )}
      </div>

      <div>
        <p className="mb-2 text-sm font-medium">Recording</p>
        {detail.hasRecording ? (
          <CallRecordingPlayer callId={detail.id} playbackUrl={detail.recordingPlaybackUrl} />
        ) : (
          <p className="text-sm text-muted-foreground">No recording available.</p>
        )}
      </div>

      {detail.customer?.id ? (
        <div>
          <p className="mb-2 text-sm font-medium">Link to job notes</p>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <select
              className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm sm:max-w-xs"
              value={selectedVisitId}
              onChange={(e) => setSelectedVisitId(e.target.value)}
            >
              <option value="">Select a job…</option>
              {visits.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.title} · {new Date(v.startAt).toLocaleDateString()}
                </option>
              ))}
            </select>
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={linking || !selectedVisitId}
              onClick={() => void linkToJob()}
            >
              {linking ? "Linking…" : "Attach call"}
            </Button>
          </div>
          {detail.visitId ? (
            <p className="mt-1 text-xs text-muted-foreground">
              Linked job:{" "}
              <Link href={`/visits/${detail.visitId}`} className="text-primary hover:underline">
                View visit
              </Link>
            </p>
          ) : null}
        </div>
      ) : null}

      <div>
        <p className="mb-2 text-sm font-medium">Transcript</p>
        <CallTranscriptPanel
          callId={detail.id}
          transcript={detail.transcript}
          hasRecording={detail.hasRecording}
          onTranscribed={(text) => void handleTranscribed(text)}
        />
      </div>
    </div>
  );
}
