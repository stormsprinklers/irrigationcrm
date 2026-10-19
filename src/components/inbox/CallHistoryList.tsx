"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { FileText, Phone, Play } from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { CustomerTeamScope } from "@/lib/inbox/types";

type CallLog = {
  id: string;
  direction: string;
  fromNumber: string;
  toNumber: string;
  status: string;
  durationSec?: number | null;
  recordingUrl?: string | null;
  transcript?: string | null;
  startedAt: string;
  customer?: { id: string; name: string } | null;
  user?: { name: string } | null;
};

export function CallHistoryList({
  scope,
  selectedId,
  onSelect,
}: {
  scope: CustomerTeamScope;
  selectedId: string | null;
  onSelect: (id: string) => void;
}) {
  const [calls, setCalls] = useState<CallLog[]>([]);

  useEffect(() => {
    async function load() {
      const res = await fetch(
        `/api/inbox/voice/history?scope=${scope === "customers" ? "external" : "internal"}`
      );
      if (res.ok) setCalls(await res.json());
    }
    load();
    const interval = setInterval(load, 10000);
    return () => clearInterval(interval);
  }, [scope]);

  if (!calls.length) {
    return <div className="p-4 text-sm text-muted-foreground">No call history yet.</div>;
  }

  return (
    <ScrollArea className="h-full">
      <ul>
        {calls.map((call) => {
          const label =
            call.customer?.name ??
            call.user?.name ??
            (call.direction === "OUTBOUND" ? call.toNumber : call.fromNumber);
          const hasRecording = Boolean(call.recordingUrl);
          const hasTranscript = Boolean(call.transcript?.trim());

          return (
            <li key={call.id}>
              <div
                role="button"
                tabIndex={0}
                onClick={() => onSelect(call.id)}
                onKeyDown={(event) => {
                  if (event.target !== event.currentTarget) return;
                  if (event.key !== "Enter" && event.key !== " ") return;
                  event.preventDefault();
                  onSelect(call.id);
                }}
                className={cn(
                  "flex w-full cursor-pointer items-start gap-3 border-b border-border px-4 py-3 text-left hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-inset",
                  selectedId === call.id && "bg-highlight"
                )}
              >
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10">
                  <Phone className="h-4 w-4 text-primary" />
                </div>
                <div className="min-w-0 flex-1">
                  {call.customer?.id ? (
                    <Link
                      href={`/customers/${call.customer.id}`}
                      onClick={(event) => event.stopPropagation()}
                      className="block truncate rounded-sm text-sm font-semibold hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                      aria-label={`View ${call.customer.name}'s customer profile`}
                    >
                      {label}
                    </Link>
                  ) : (
                    <p className="truncate text-sm font-semibold">{label}</p>
                  )}
                  <p className="text-xs text-muted-foreground">
                    {call.direction} · {call.status}
                    {call.durationSec ? ` · ${call.durationSec}s` : ""}
                  </p>
                </div>
                <div className="flex shrink-0 flex-col items-end gap-1">
                  {hasRecording ? (
                    <Badge variant="outline" className="text-[10px]">
                      <Play className="mr-1 h-3 w-3" />
                      Rec
                    </Badge>
                  ) : null}
                  {hasTranscript ? (
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
    </ScrollArea>
  );
}
