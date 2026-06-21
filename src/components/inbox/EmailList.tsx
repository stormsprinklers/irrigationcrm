"use client";

import { useEffect, useState } from "react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { CustomerNameWithBadge } from "@/components/customers/CustomerNameWithBadge";
import { cn } from "@/lib/utils";
import type { InboxScope } from "@/lib/inbox/types";

type Email = {
  id: string;
  fromEmail: string;
  subject: string;
  bodyText?: string | null;
  createdAt: string;
  isRead: boolean;
  customer?: { name: string; doNotService?: boolean } | null;
  user?: { name: string } | null;
};

export function EmailList({
  scope,
  folder,
  selectedId,
  onSelect,
}: {
  scope: InboxScope;
  folder: string;
  selectedId: string | null;
  onSelect: (id: string) => void;
}) {
  const [emails, setEmails] = useState<Email[]>([]);

  useEffect(() => {
    async function load() {
      const res = await fetch(
        `/api/inbox/email?folder=${folder}&scope=${scope === "customers" ? "external" : "internal"}`
      );
      if (res.ok) setEmails(await res.json());
    }
    load();
    const interval = setInterval(load, 10000);
    return () => clearInterval(interval);
  }, [scope, folder]);

  if (!emails.length) {
    return <div className="p-4 text-sm text-muted-foreground">No emails in this folder.</div>;
  }

  return (
    <ScrollArea className="h-full">
      <ul>
        {emails.map((email) => {
          const from = email.customer?.name ?? email.user?.name ?? email.fromEmail;
          return (
            <li key={email.id}>
              <button
                type="button"
                onClick={() => onSelect(email.id)}
                className={cn(
                  "flex w-full flex-col gap-1 border-b border-border px-4 py-3 text-left hover:bg-muted/50",
                  selectedId === email.id && "bg-highlight",
                  !email.isRead && "font-semibold"
                )}
              >
                <div className="flex items-center justify-between gap-2">
                  {email.customer?.name ? (
                    <CustomerNameWithBadge
                      name={email.customer.name}
                      doNotService={email.customer.doNotService}
                      className="min-w-0 truncate text-sm"
                    />
                  ) : (
                    <span className="truncate text-sm">{from}</span>
                  )}
                  <span className="shrink-0 text-[10px] text-muted-foreground">
                    {new Date(email.createdAt).toLocaleDateString()}
                  </span>
                </div>
                <span className="truncate text-sm">{email.subject}</span>
                <span className="truncate text-xs text-muted-foreground">
                  {email.bodyText?.slice(0, 80)}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </ScrollArea>
  );
}
