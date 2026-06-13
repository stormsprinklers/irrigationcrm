"use client";

import { InboxEmptyDetail } from "@/components/inbox/InboxEmptyDetail";
import { ThreadList } from "@/components/inbox/ThreadList";
import { Button } from "@/components/ui/button";
import { inboxThreads } from "@/lib/mock/inbox-threads";
import { MoreVertical, PenSquare } from "lucide-react";

export default function InboxPage() {
  return (
    <>
      <div className="flex w-full max-w-md flex-col border-r border-border bg-white">
          <div className="flex items-center justify-between border-b border-border px-4 py-3">
            <div>
              <p className="text-xs text-muted-foreground">Inbox &gt; All Comms</p>
              <h2 className="text-lg font-semibold">All Comms</h2>
            </div>
            <div className="flex items-center gap-1">
              <Button variant="ghost" size="icon" className="h-8 w-8">
                <MoreVertical className="h-4 w-4" />
              </Button>
              <Button variant="ghost" size="icon" className="h-8 w-8">
                <PenSquare className="h-4 w-4" />
              </Button>
            </div>
          </div>
          <div className="flex-1 overflow-hidden">
            <ThreadList threads={inboxThreads} />
          </div>
        </div>
      <div className="flex-1 overflow-hidden">
        <InboxEmptyDetail />
      </div>
    </>
  );
}
