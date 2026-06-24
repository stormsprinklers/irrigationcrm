"use client";

import Link from "next/link";
import { Facebook, Instagram, MessageCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import type { InboxChannel, InboxScope } from "@/lib/inbox/types";
import { channelLabel, getInboxScopes, scopeLabel } from "@/lib/inbox/types";

type InboxChannelLayoutProps = {
  channel: InboxChannel;
  scope: InboxScope;
  list: React.ReactNode;
  detail: React.ReactNode;
};

export function InboxChannelLayout({ channel, scope, list, detail }: InboxChannelLayoutProps) {
  const base = `/inbox/${channel}`;
  const scopes = getInboxScopes(channel);

  return (
    <div className="flex h-full w-full min-w-0 overflow-hidden">
      <div className="flex h-full w-80 shrink-0 flex-col border-r border-border bg-white">
        <div className="shrink-0 border-b border-border px-4 py-3">
          <p className="text-xs text-muted-foreground">
            Inbox &gt; {channelLabel(channel)} &gt; {scopeLabel(channel, scope)}
          </p>
          <div className="mt-2 flex rounded-lg border border-border p-1">
            {scopes.map((s) => (
              <Link
                key={s}
                href={`${base}/${s}`}
                className={cn(
                  "flex-1 rounded-md px-2 py-1.5 text-center text-sm font-medium transition-colors",
                  scope === s ? "bg-primary text-white" : "text-muted-foreground hover:bg-muted"
                )}
              >
                {scopeLabel(channel, s)}
              </Link>
            ))}
          </div>
        </div>
        <div className="min-h-0 flex-1 overflow-hidden">{list}</div>
      </div>
      <div className="flex h-full min-w-0 flex-1 flex-col overflow-hidden bg-white">{detail}</div>
    </div>
  );
}
