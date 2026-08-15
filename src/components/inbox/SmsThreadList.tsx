"use client";

import { useEffect, useState } from "react";
import { AlertCircle } from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { InboxCountOrb } from "@/components/layout/InboxCountOrb";
import { CustomerNameWithBadge } from "@/components/customers/CustomerNameWithBadge";
import { cn } from "@/lib/utils";
import { formatPhoneDisplay } from "@/lib/inbox/phone";
import { isSmsNotDelivered } from "@/lib/inbox/sms-delivery";
import type { CustomerTeamScope } from "@/lib/inbox/types";

type Conversation = {
  id: string;
  participantPhone?: string | null;
  title?: string | null;
  unreadCount?: number;
  customer?: { name: string; phone?: string | null; doNotService?: boolean } | null;
  messages: {
    body: string;
    sentAt: string;
    direction?: "INBOUND" | "OUTBOUND";
    deliveryStatus?: string | null;
  }[];
};

export function SmsThreadList({
  scope,
  selectedId,
  onSelect,
}: {
  scope: CustomerTeamScope;
  selectedId: string | null;
  onSelect: (id: string) => void;
}) {
  const [threads, setThreads] = useState<Conversation[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      setLoading(true);
      const res = await fetch(`/api/inbox/sms/conversations?scope=${scope === "customers" ? "external" : "internal"}`);
      if (res.ok) {
        setThreads(await res.json());
      }
      setLoading(false);
    }
    load();
    const interval = setInterval(load, 4000);
    return () => clearInterval(interval);
  }, [scope]);

  if (loading && !threads.length) {
    return <div className="p-4 text-sm text-muted-foreground">Loading...</div>;
  }

  if (!threads.length) {
    return (
      <div className="p-4 text-sm text-muted-foreground">
        No conversations yet. Click the compose icon above to start a new message.
      </div>
    );
  }

  return (
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
          const unreadCount = thread.unreadCount ?? 0;

          return (
            <li key={thread.id}>
              <button
                type="button"
                onClick={() => onSelect(thread.id)}
                className={cn(
                  "flex w-full items-start gap-3 border-b border-border px-4 py-3 text-left hover:bg-muted/50",
                  selectedId === thread.id && "bg-highlight",
                  unreadCount > 0 && selectedId !== thread.id && "bg-primary/5"
                )}
              >
                <Avatar className="h-10 w-10">
                  <AvatarFallback className="bg-primary/10 text-xs text-primary">
                    {initials}
                  </AvatarFallback>
                </Avatar>
                <div className="min-w-0 flex-1">
                  {thread.customer?.name ? (
                    <>
                      <CustomerNameWithBadge
                        name={thread.customer.name}
                        doNotService={thread.customer.doNotService}
                        nameClassName={cn("truncate text-sm", unreadCount > 0 ? "font-bold" : "font-semibold")}
                        className="max-w-full"
                      />
                      {displayPhone ? (
                        <p className="truncate text-xs text-muted-foreground">{displayPhone}</p>
                      ) : null}
                      <p className={cn("truncate text-sm", unreadCount > 0 ? "font-medium text-foreground" : "text-muted-foreground")}>
                        {snippet}
                      </p>
                      {latestNotDelivered ? (
                        <p className="mt-0.5 flex items-center gap-1 text-[11px] font-medium text-destructive">
                          <AlertCircle className="h-3 w-3 shrink-0" aria-hidden />
                          Not delivered
                        </p>
                      ) : null}
                    </>
                  ) : (
                    <>
                      <p className={cn("truncate text-sm", unreadCount > 0 ? "font-bold" : "font-semibold")}>
                        {label}
                      </p>
                      <p className={cn("truncate text-sm", unreadCount > 0 ? "font-medium text-foreground" : "text-muted-foreground")}>
                        {snippet}
                      </p>
                      {latestNotDelivered ? (
                        <p className="mt-0.5 flex items-center gap-1 text-[11px] font-medium text-destructive">
                          <AlertCircle className="h-3 w-3 shrink-0" aria-hidden />
                          Not delivered
                        </p>
                      ) : null}
                    </>
                  )}
                </div>
                <div className="flex shrink-0 flex-col items-end gap-1">
                  {unreadCount > 0 ? <InboxCountOrb count={unreadCount} tone="unread" /> : null}
                  {scope === "customers" && thread.participantPhone && (
                    <Badge variant="outline" className="text-[10px]">
                      SMS
                    </Badge>
                  )}
                </div>
              </button>
            </li>
          );
        })}
      </ul>
    </ScrollArea>
  );
}
