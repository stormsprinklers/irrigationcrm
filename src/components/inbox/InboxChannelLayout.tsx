"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import type { InboxChannel, InboxScope } from "@/lib/inbox/types";
import { channelLabel, scopeLabel } from "@/lib/inbox/types";

type InboxChannelLayoutProps = {
  channel: InboxChannel;
  scope: InboxScope;
  list: React.ReactNode;
  detail: React.ReactNode;
};

export function InboxChannelLayout({ channel, scope, list, detail }: InboxChannelLayoutProps) {
  const pathname = usePathname();
  const base = `/inbox/${channel}`;

  return (
    <div className="flex h-full overflow-hidden">
      <div className="flex w-full max-w-md flex-col border-r border-border bg-white">
        <div className="border-b border-border px-4 py-3">
          <p className="text-xs text-muted-foreground">
            Inbox &gt; {channelLabel(channel)} &gt; {scopeLabel(scope)}
          </p>
          <div className="mt-2 flex rounded-lg border border-border p-1">
            <Link
              href={`${base}/customers`}
              className={cn(
                "flex-1 rounded-md px-3 py-1.5 text-center text-sm font-medium transition-colors",
                scope === "customers"
                  ? "bg-primary text-white"
                  : "text-muted-foreground hover:bg-muted"
              )}
            >
              Customers
            </Link>
            <Link
              href={`${base}/team`}
              className={cn(
                "flex-1 rounded-md px-3 py-1.5 text-center text-sm font-medium transition-colors",
                scope === "team"
                  ? "bg-primary text-white"
                  : "text-muted-foreground hover:bg-muted"
              )}
            >
              Team
            </Link>
          </div>
        </div>
        <div className="flex-1 overflow-hidden">{list}</div>
      </div>
      <div className="flex-1 overflow-hidden bg-white">{detail}</div>
    </div>
  );
}
