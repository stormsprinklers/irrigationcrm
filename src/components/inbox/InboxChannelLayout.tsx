"use client";

import Link from "next/link";
import { cn } from "@/lib/utils";
import type { InboxChannel, InboxScope } from "@/lib/inbox/types";
import {
  channelHasInlineScopeSwitch,
  channelLabel,
  getInboxScopes,
  scopeLabel,
} from "@/lib/inbox/types";
import { InboxListDetailShell } from "@/components/inbox/InboxListDetailShell";

type InboxChannelLayoutProps = {
  channel: InboxChannel;
  scope: InboxScope;
  list: React.ReactNode;
  detail: React.ReactNode;
  selectedId?: string | null;
  listLabel?: string;
  listFirst?: boolean;
  composing?: boolean;
  onCompose?: () => void;
  onMobileBack?: () => void;
  /** Optional override for the breadcrumb / header chrome. */
  chrome?: React.ReactNode;
};

export function InboxChannelLayout({
  channel,
  scope,
  list,
  detail,
  selectedId = null,
  listLabel = "Conversations",
  listFirst = false,
  composing = false,
  onCompose,
  onMobileBack,
  chrome: chromeOverride,
}: InboxChannelLayoutProps) {
  const base = `/inbox/${channel}`;
  const scopes = getInboxScopes(channel);
  const showScopeSwitch = channelHasInlineScopeSwitch(channel) && scopes.length > 1;

  const chrome =
    chromeOverride ??
    (showScopeSwitch ? (
      <>
        <p className="text-xs text-muted-foreground">Inbox &gt; {channelLabel(channel)}</p>
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
        <p className="mt-1.5 text-[11px] text-muted-foreground">
          {scope === "team"
            ? "Internal team messaging"
            : "Customer SMS — switch to Team for internal messages"}
        </p>
      </>
    ) : (
      <p className="text-xs text-muted-foreground">Inbox &gt; {channelLabel(channel)}</p>
    ));

  return (
    <InboxListDetailShell
      chrome={chrome}
      list={list}
      detail={detail}
      listLabel={listLabel}
      selectedId={selectedId}
      listFirst={listFirst}
      composing={composing}
      onCompose={onCompose}
      onMobileBack={onMobileBack}
    />
  );
}
