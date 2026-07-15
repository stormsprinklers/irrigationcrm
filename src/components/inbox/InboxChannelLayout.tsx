"use client";

import Link from "next/link";
import { cn } from "@/lib/utils";
import type { InboxChannel, InboxScope } from "@/lib/inbox/types";
import { channelLabel, getInboxScopes, scopeLabel } from "@/lib/inbox/types";
import { InboxListDetailShell } from "@/components/inbox/InboxListDetailShell";

type InboxChannelLayoutProps = {
  channel: InboxChannel;
  scope: InboxScope;
  list: React.ReactNode;
  detail: React.ReactNode;
  /** Closes the mobile list drawer when a conversation/call is selected. */
  selectedId?: string | null;
  listLabel?: string;
};

export function InboxChannelLayout({
  channel,
  scope,
  list,
  detail,
  selectedId = null,
  listLabel = "Conversations",
}: InboxChannelLayoutProps) {
  const base = `/inbox/${channel}`;
  const scopes = getInboxScopes(channel);

  const chrome = (
    <>
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
    </>
  );

  return (
    <InboxListDetailShell
      chrome={chrome}
      list={list}
      detail={detail}
      listLabel={listLabel}
      selectedId={selectedId}
    />
  );
}
