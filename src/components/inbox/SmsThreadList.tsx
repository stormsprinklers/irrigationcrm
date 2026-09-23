"use client";

import { useEffect, useState } from "react";
import { AlertCircle, Search } from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Input } from "@/components/ui/input";
import { CustomerNameWithBadge } from "@/components/customers/CustomerNameWithBadge";
import { cn } from "@/lib/utils";
import { formatPhoneDisplay } from "@/lib/inbox/phone";
import { formatSmsMessageTime } from "@/lib/inbox/message-time";
import { isSmsNotDelivered } from "@/lib/inbox/sms-delivery";
import type { CustomerTeamScope } from "@/lib/inbox/types";

type Conversation = {
  id: string;
  participantPhone?: string | null;
  title?: string | null;
  unreadCount?: number;
  needsResponse?: boolean;
  customer?: { name: string; phone?: string | null; doNotService?: boolean } | null;
  messages: {
    body: string;
    sentAt: string;
    direction?: "INBOUND" | "OUTBOUND";
    deliveryStatus?: string | null;
  }[];
};

export type SmsFolder = "open" | "general" | "spam";

export function SmsThreadList({
  scope,
  selectedId,
  onSelect,
  folder = "general",
}: {
  scope: CustomerTeamScope;
  selectedId: string | null;
  onSelect: (id: string) => void;
  folder?: SmsFolder;
}) {
  const [threads, setThreads] = useState<Conversation[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      const params = new URLSearchParams({
        scope: scope === "customers" ? "external" : "internal",
        folder,
      });
      if (search.trim()) params.set("search", search.trim());
      const res = await fetch(`/api/inbox/sms/conversations?${params.toString()}`);
      if (res.ok) {
        const rows = await res.json();
        if (!cancelled) setThreads(rows);
      }
      if (!cancelled) setLoading(false);
    }
    const initial = window.setTimeout(() => void load(), search.trim() ? 250 : 0);
    const interval = setInterval(load, 4000);
    return () => {
      cancelled = true;
      window.clearTimeout(initial);
      clearInterval(interval);
    };
  }, [scope, folder, search]);

  const emptyMessage = search.trim()
    ? "No matching conversations."
    : folder === "open"
      ? "No open messages."
      : folder === "spam"
        ? "No spam messages."
        : "No conversations yet.";

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {scope === "customers" && folder !== "spam" ? (
        <div className="shrink-0 border-b px-3 py-2">
          <div className="relative">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search customers or phone numbers"
              className="h-9 pl-8"
            />
          </div>
        </div>
      ) : null}
      <div className="min-h-0 flex-1">
        {loading && !threads.length ? (
          <div className="p-4 text-sm text-muted-foreground">Loading...</div>
        ) : !threads.length ? (
          <div className="p-4 text-sm text-muted-foreground">{emptyMessage}</div>
        ) : (
          <ScrollArea className="h-full">
            <ul>
        {threads.map((thread) => {
          const displayPhone = thread.participantPhone
            ? formatPhoneDisplay(thread.participantPhone)
            : null;
          const label =
            thread.customer?.name ??
            thread.title ??
            displayPhone ??
            "Conversation";
          const snippet = thread.messages[0]?.body ?? "";
          const initials = label.slice(0, 2).toUpperCase();
          const latest = thread.messages[0];
          const latestNotDelivered =
            latest?.direction === "OUTBOUND" && isSmsNotDelivered(latest.deliveryStatus);
          const needsResponse = thread.needsResponse === true;

          return (
            <li key={thread.id}>
              <button
                type="button"
                onClick={() => onSelect(thread.id)}
                className={cn(
                  "flex w-full items-start gap-3 border-b border-border px-4 py-3 text-left hover:bg-muted/50",
                  selectedId === thread.id && "bg-highlight"
                )}
              >
                <Avatar className="h-10 w-10">
                  <AvatarFallback className="bg-primary/10 text-xs text-primary">
                    {initials}
                  </AvatarFallback>
                </Avatar>
                <div className="min-w-0 flex-1">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex min-w-0 items-center gap-1.5">
                      {needsResponse ? (
                        <span
                          className="h-2 w-2 shrink-0 rounded-full bg-primary"
                          role="img"
                          aria-label="Needs reply"
                          title="Needs reply"
                        />
                      ) : null}
                      {thread.customer?.name ? (
                        <CustomerNameWithBadge
                          name={thread.customer.name}
                          doNotService={thread.customer.doNotService}
                          nameClassName="truncate text-sm font-semibold"
                          className="min-w-0 max-w-full"
                        />
                      ) : (
                        <p className="truncate text-sm font-semibold">{label}</p>
                      )}
                    </div>
                    {latest?.sentAt ? (
                      <time
                        dateTime={latest.sentAt}
                        className="shrink-0 text-[11px] text-muted-foreground"
                      >
                        {formatSmsMessageTime(latest.sentAt)}
                      </time>
                    ) : null}
                  </div>
                  {thread.customer?.name && displayPhone ? (
                    <p className="truncate text-xs text-muted-foreground">{displayPhone}</p>
                  ) : null}
                  <p className="mt-0.5 line-clamp-2 text-sm leading-snug text-muted-foreground">
                    {snippet || "Media message"}
                  </p>
                  {latestNotDelivered ? (
                    <p className="mt-0.5 flex items-center gap-1 text-[11px] font-medium text-destructive">
                      <AlertCircle className="h-3 w-3 shrink-0" aria-hidden />
                      Not delivered
                    </p>
                  ) : null}
                </div>
              </button>
            </li>
          );
        })}
            </ul>
          </ScrollArea>
        )}
      </div>
    </div>
  );
}
