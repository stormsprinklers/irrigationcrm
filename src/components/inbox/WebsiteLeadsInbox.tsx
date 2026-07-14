"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ExternalLink, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import { sanitizeEmailHtml } from "@/lib/inbox/attachments";

type WebsiteLeadInboxItem = {
  id: string;
  channel: "email" | "sms";
  name: string;
  source: string | null;
  subject: string | null;
  preview: string;
  createdAt: string;
  isRead: boolean;
  leadId: string | null;
  conversationId?: string;
};

type EmailDetail = {
  id: string;
  fromEmail: string;
  subject: string;
  bodyText?: string | null;
  bodyHtml?: string | null;
  threadId?: string | null;
};

function formatWhen(iso: string) {
  return new Date(iso).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export function WebsiteLeadsInbox() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [items, setItems] = useState<WebsiteLeadInboxItem[]>([]);
  const [selected, setSelected] = useState<WebsiteLeadInboxItem | null>(null);
  const [emailDetail, setEmailDetail] = useState<EmailDetail | null>(null);
  const [smsBody, setSmsBody] = useState<string | null>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);
  /** Tracks which deep-link query we've already applied so list refreshes don't fight clicks. */
  const appliedDeepLinkRef = useRef<string | null>(null);

  const loadItems = useCallback(async () => {
    const res = await fetch("/api/inbox/leads");
    if (!res.ok) return;
    const data = await res.json();
    setItems(data.items ?? []);
  }, []);

  useEffect(() => {
    void loadItems();
    const interval = setInterval(loadItems, 15_000);
    return () => clearInterval(interval);
  }, [loadItems]);

  // Deep-link from notifications: apply once per emailId/conversationId, then stop
  // re-forcing selection so clicking other leads works.
  useEffect(() => {
    const emailId = searchParams.get("emailId");
    const conversationId = searchParams.get("conversationId");
    if (!items.length) return;

    const deepLinkKey = emailId
      ? `email:${emailId}`
      : conversationId
        ? `sms:${conversationId}`
        : null;

    if (!deepLinkKey) {
      appliedDeepLinkRef.current = null;
      return;
    }
    if (appliedDeepLinkRef.current === deepLinkKey) return;

    if (emailId) {
      const match = items.find((item) => item.channel === "email" && item.id === emailId);
      if (match) {
        setSelected(match);
        appliedDeepLinkRef.current = deepLinkKey;
      }
      return;
    }

    const match = items.find(
      (item) => item.channel === "sms" && item.conversationId === conversationId
    );
    if (match) {
      setSelected(match);
      appliedDeepLinkRef.current = deepLinkKey;
    }
  }, [searchParams, items]);

  useEffect(() => {
    if (!selected) {
      setEmailDetail(null);
      setSmsBody(null);
      return;
    }

    let cancelled = false;
    setLoadingDetail(true);
    if (selected.channel === "email") {
      fetch(`/api/inbox/email/${selected.id}`)
        .then((r) => r.json())
        .then((data) => {
          if (cancelled) return;
          setEmailDetail(data);
          setSmsBody(null);
          setItems((current) => {
            const target = current.find((item) => item.id === selected.id);
            if (!target || target.isRead) return current;
            return current.map((item) =>
              item.id === selected.id ? { ...item, isRead: true } : item
            );
          });
        })
        .catch(() => {
          if (!cancelled) toast.error("Failed to load form submission");
        })
        .finally(() => {
          if (!cancelled) setLoadingDetail(false);
        });
      return () => {
        cancelled = true;
      };
    }

    if (!selected.conversationId) {
      setLoadingDetail(false);
      return;
    }

    const conversationId = selected.conversationId;
    const selectedId = selected.id;
    const preview = selected.preview;
    fetch(`/api/inbox/sms/conversations/${conversationId}/messages`)
      .then((r) => r.json())
      .then((data) => {
        if (cancelled) return;
        const messages = data.messages ?? [];
        const message = messages.find((row: { id: string }) => row.id === selectedId);
        setSmsBody(message?.body ?? preview);
        setEmailDetail(null);
      })
      .catch(() => {
        if (!cancelled) toast.error("Failed to load form submission");
      })
      .finally(() => {
        if (!cancelled) setLoadingDetail(false);
      });

    return () => {
      cancelled = true;
    };
  }, [selected]);

  function selectItem(item: WebsiteLeadInboxItem) {
    setSelected(item);
    // Drop notification deep-link params so they can't snap selection back.
    if (searchParams.get("emailId") || searchParams.get("conversationId")) {
      appliedDeepLinkRef.current = null;
      router.replace("/inbox/leads", { scroll: false });
    }
  }

  async function removeSelected() {
    if (!selected || selected.channel !== "email") return;
    const res = await fetch(`/api/inbox/email/${selected.id}`, { method: "DELETE" });
    if (!res.ok) {
      toast.error("Failed to remove submission");
      return;
    }
    toast.success("Removed");
    setSelected(null);
    if (searchParams.get("emailId") || searchParams.get("conversationId")) {
      appliedDeepLinkRef.current = null;
      router.replace("/inbox/leads", { scroll: false });
    }
    await loadItems();
  }

  return (
    <div className="flex h-full w-full min-w-0 overflow-hidden">
      <div className="flex h-full w-80 shrink-0 flex-col border-r border-border bg-white">
        <div className="shrink-0 border-b border-border px-4 py-3">
          <p className="text-xs text-muted-foreground">Inbox &gt; Leads</p>
          <h2 className="mt-1 font-medium">Website forms</h2>
          <p className="mt-1 text-xs text-muted-foreground">
            Contact and other form submissions from stormsprinklers.com
          </p>
        </div>
        <ScrollArea className="min-h-0 flex-1">
          {!items.length ? (
            <p className="p-4 text-sm text-muted-foreground">No form submissions yet.</p>
          ) : (
            <ul>
              {items.map((item) => (
                <li key={`${item.channel}-${item.id}`}>
                  <button
                    type="button"
                    onClick={() => selectItem(item)}
                    className={cn(
                      "flex w-full flex-col gap-1 border-b border-border px-4 py-3 text-left hover:bg-muted/50",
                      selected?.id === item.id &&
                        selected?.channel === item.channel &&
                        "bg-highlight",
                      !item.isRead && item.channel === "email" && "font-semibold"
                    )}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="truncate text-sm">{item.name}</span>
                      <span className="shrink-0 text-[10px] text-muted-foreground">
                        {formatWhen(item.createdAt)}
                      </span>
                    </div>
                    {item.source ? (
                      <span className="text-xs text-primary">{item.source}</span>
                    ) : null}
                    <span className="truncate text-xs text-muted-foreground">{item.preview}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </ScrollArea>
      </div>

      <div className="flex h-full min-w-0 flex-1 flex-col overflow-hidden bg-white">
        {!selected ? (
          <div className="flex h-full items-center justify-center p-6 text-sm text-muted-foreground">
            Select a form submission to view details.
          </div>
        ) : loadingDetail ? (
          <div className="p-6 text-sm text-muted-foreground">Loading...</div>
        ) : (
          <>
            <div className="flex items-start justify-between border-b border-border p-4">
              <div>
                <h3 className="text-lg font-semibold">{selected.name}</h3>
                {selected.source ? (
                  <p className="text-sm text-muted-foreground">Source: {selected.source}</p>
                ) : null}
                {emailDetail ? (
                  <p className="text-sm text-muted-foreground">From: {emailDetail.fromEmail}</p>
                ) : null}
                <p className="text-xs text-muted-foreground">{formatWhen(selected.createdAt)}</p>
              </div>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" asChild>
                  <Link href="/customers/leads">
                    <ExternalLink className="mr-1 h-4 w-4" />
                    All leads
                  </Link>
                </Button>
                {selected.channel === "email" ? (
                  <Button variant="ghost" size="icon" onClick={removeSelected}>
                    <Trash2 className="h-4 w-4" />
                  </Button>
                ) : null}
              </div>
            </div>
            <div className="flex-1 overflow-auto p-4">
              {emailDetail?.bodyHtml ? (
                <div
                  className="prose prose-sm max-w-none whitespace-pre-wrap text-sm"
                  dangerouslySetInnerHTML={{
                    __html: sanitizeEmailHtml(emailDetail.bodyHtml),
                  }}
                />
              ) : (
                <div className="prose prose-sm max-w-none whitespace-pre-wrap text-sm">
                  {emailDetail?.bodyText ?? smsBody ?? selected.preview}
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
