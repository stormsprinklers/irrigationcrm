"use client";

import { useEffect, useState } from "react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { InboxScope } from "@/lib/inbox/types";

type Conversation = {
  id: string;
  participantPhone?: string | null;
  title?: string | null;
  customer?: { name: string; phone?: string | null } | null;
  messages: { body: string; sentAt: string }[];
};

export function SmsThreadList({
  scope,
  selectedId,
  onSelect,
}: {
  scope: InboxScope;
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
    const interval = setInterval(load, 8000);
    return () => clearInterval(interval);
  }, [scope]);

  if (loading && !threads.length) {
    return <div className="p-4 text-sm text-muted-foreground">Loading...</div>;
  }

  if (!threads.length) {
    return (
      <div className="p-4 text-sm text-muted-foreground">
        No conversations yet. Start a new message.
      </div>
    );
  }

  return (
    <ScrollArea className="h-full">
      <ul>
        {threads.map((thread) => {
          const label =
            thread.customer?.name ??
            thread.title ??
            thread.participantPhone ??
            "Conversation";
          const snippet = thread.messages[0]?.body ?? "";
          const initials = label.slice(0, 2).toUpperCase();

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
                  <p className="truncate text-sm font-semibold">{label}</p>
                  <p className="truncate text-sm text-muted-foreground">{snippet}</p>
                </div>
                {scope === "customers" && thread.participantPhone && (
                  <Badge variant="outline" className="shrink-0 text-[10px]">
                    SMS
                  </Badge>
                )}
              </button>
            </li>
          );
        })}
      </ul>
    </ScrollArea>
  );
}
