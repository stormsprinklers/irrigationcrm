"use client";

import { useState } from "react";
import type { InboxThread } from "@/lib/mock/inbox-threads";
import { cn } from "@/lib/utils";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";

export function ThreadList({ threads }: { threads: InboxThread[] }) {
  const [selectedId, setSelectedId] = useState<string | null>(null);

  return (
    <ScrollArea className="h-full">
      <ul>
        {threads.map((thread) => (
          <li key={thread.id}>
            <button
              type="button"
              onClick={() => setSelectedId(thread.id)}
              className={cn(
                "flex w-full items-start gap-3 border-b border-border px-4 py-3 text-left transition-colors hover:bg-muted/50",
                selectedId === thread.id && "bg-highlight"
              )}
            >
              <Avatar className="h-10 w-10">
                <AvatarFallback className="bg-primary/10 text-xs text-primary">
                  {thread.initials}
                </AvatarFallback>
              </Avatar>
              <div className="min-w-0 flex-1">
                <div className="flex items-start justify-between gap-2">
                  <p className="truncate text-sm font-semibold">{thread.name}</p>
                  <span className="shrink-0 text-xs text-muted-foreground">
                    {thread.timestamp}
                  </span>
                </div>
                <p className="mt-0.5 truncate text-sm text-muted-foreground">
                  {thread.snippet}
                </p>
              </div>
              {thread.unreadCount && (
                <Badge variant="unread">{thread.unreadCount}</Badge>
              )}
            </button>
          </li>
        ))}
      </ul>
    </ScrollArea>
  );
}
