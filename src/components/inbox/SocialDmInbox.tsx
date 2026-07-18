"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Facebook, Instagram, Send } from "lucide-react";
import { toast } from "sonner";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { CustomerNameWithBadge } from "@/components/customers/CustomerNameWithBadge";
import { cn } from "@/lib/utils";
import { formatSmsMessageTime } from "@/lib/inbox/message-time";
import type { SocialScope } from "@/lib/inbox/types";

const PLATFORM_CONFIG: Record<
  SocialScope,
  { label: string; icon: typeof Facebook; color: string }
> = {
  facebook: { label: "Facebook", icon: Facebook, color: "text-[#1877F2]" },
  instagram: { label: "Instagram", icon: Instagram, color: "text-[#E4405F]" },
};

export type SocialPlatformFilter = SocialScope | "all";

type Conversation = {
  id: string;
  title?: string | null;
  participantMetaId?: string | null;
  platform?: SocialScope | null;
  customer?: { name: string; doNotService?: boolean } | null;
  messages: { body: string; sentAt: string }[];
};

type Message = {
  id: string;
  body: string;
  direction: "INBOUND" | "OUTBOUND";
  sentAt: string;
  sender?: { name: string } | null;
};

function PlatformBadge({ platform }: { platform: SocialScope }) {
  const config = PLATFORM_CONFIG[platform];
  const Icon = config.icon;
  return (
    <Badge variant="secondary" className="gap-1 text-[10px] font-normal">
      <Icon className={`h-3 w-3 ${config.color}`} />
      {config.label}
    </Badge>
  );
}

export function SocialDmThreadList({
  platform = "all",
  selectedId,
  onSelect,
}: {
  platform?: SocialPlatformFilter;
  selectedId: string | null;
  onSelect: (id: string, platform: SocialScope) => void;
}) {
  const [threads, setThreads] = useState<Conversation[]>([]);
  const [loading, setLoading] = useState(true);
  const [metaConfigured, setMetaConfigured] = useState<boolean | null>(null);

  useEffect(() => {
    async function load() {
      setLoading(true);
      const [threadsRes, statusRes] = await Promise.all([
        fetch(`/api/inbox/social/conversations?platform=${platform}`),
        fetch("/api/inbox/social/status"),
      ]);

      if (statusRes.ok) {
        const status = await statusRes.json();
        setMetaConfigured(Boolean(status.configured));
      }

      if (threadsRes.ok) {
        setThreads(await threadsRes.json());
      }
      setLoading(false);
    }

    load();
    const interval = setInterval(load, 5000);
    return () => clearInterval(interval);
  }, [platform]);

  if (loading && !threads.length) {
    return <div className="p-4 text-sm text-muted-foreground">Loading...</div>;
  }

  if (metaConfigured === false) {
    return (
      <ScrollArea className="h-full">
        <div className="flex flex-col items-center justify-center px-6 py-12 text-center">
          <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-muted">
            <Facebook className="h-6 w-6 text-[#1877F2]" />
          </div>
          <p className="text-sm font-medium">Social DMs not connected</p>
          <p className="mt-2 max-w-xs text-sm text-muted-foreground">
            Connect Meta in{" "}
            <Link href="/settings/integrations/meta" className="text-primary underline">
              Settings → Meta webhooks
            </Link>{" "}
            to receive Facebook and Instagram DMs here.
          </p>
        </div>
      </ScrollArea>
    );
  }

  if (!threads.length) {
    return (
      <div className="p-4 text-sm text-muted-foreground">
        No social conversations yet. New Facebook and Instagram DMs will appear here automatically.
      </div>
    );
  }

  return (
    <ScrollArea className="h-full">
      <ul>
        {threads.map((thread) => {
          const threadPlatform: SocialScope =
            thread.platform === "instagram" ? "instagram" : "facebook";
          const config = PLATFORM_CONFIG[threadPlatform];
          const label = thread.customer?.name ?? thread.title ?? `${config.label} user`;
          const snippet = thread.messages[0]?.body ?? "";
          const initials = label.slice(0, 2).toUpperCase();

          return (
            <li key={thread.id}>
              <button
                type="button"
                onClick={() => onSelect(thread.id, threadPlatform)}
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
                  <div className="mb-0.5 flex flex-wrap items-center gap-1.5">
                    {thread.customer?.name ? (
                      <CustomerNameWithBadge
                        name={thread.customer.name}
                        doNotService={thread.customer.doNotService}
                        nameClassName="truncate text-sm font-semibold"
                        className="max-w-full"
                      />
                    ) : (
                      <p className="truncate text-sm font-semibold">{label}</p>
                    )}
                    <PlatformBadge platform={threadPlatform} />
                  </div>
                  <p className="truncate text-sm text-muted-foreground">{snippet}</p>
                </div>
              </button>
            </li>
          );
        })}
      </ul>
    </ScrollArea>
  );
}

export function SocialDmMessagePane({
  platform,
  conversationId,
  onSent,
}: {
  platform: SocialScope | null;
  conversationId: string | null;
  onSent?: () => void;
}) {
  const [conversation, setConversation] = useState<Conversation | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [body, setBody] = useState("");
  const [sending, setSending] = useState(false);
  const [resolvedFromApi, setResolvedFromApi] = useState<SocialScope | null>(null);

  const resolvedPlatform: SocialScope =
    platform ?? resolvedFromApi ?? "facebook";
  const config = PLATFORM_CONFIG[resolvedPlatform];
  const Icon = config.icon;

  useEffect(() => {
    if (!conversationId) {
      setConversation(null);
      setMessages([]);
      setResolvedFromApi(null);
      return;
    }

    async function load() {
      const res = await fetch(`/api/inbox/social/conversations/${conversationId}/messages`);
      if (!res.ok) return;
      const data = await res.json();
      setConversation(data.conversation);
      setMessages(data.messages ?? []);
      if (data.platform === "facebook" || data.platform === "instagram") {
        setResolvedFromApi(data.platform);
      }
    }

    load();
    const interval = setInterval(load, 4000);
    return () => clearInterval(interval);
  }, [conversationId]);

  async function handleSend(e: React.FormEvent) {
    e.preventDefault();
    if (!conversationId || !body.trim()) return;
    setSending(true);
    try {
      const res = await fetch(`/api/inbox/social/conversations/${conversationId}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to send");
      setBody("");
      setMessages((prev) => [...prev, data.message]);
      onSent?.();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to send message");
    } finally {
      setSending(false);
    }
  }

  const headerLabel =
    conversation?.customer?.name ?? conversation?.title ?? "Social conversation";

  return (
    <div className="flex h-full flex-col">
      <div className="shrink-0 border-b border-border px-4 py-3">
        <div className="flex flex-wrap items-center gap-2">
          {conversationId ? <Icon className={`h-4 w-4 ${config.color}`} /> : null}
          <h3 className="font-semibold">{conversationId ? headerLabel : "Social DMs"}</h3>
          {conversationId ? <PlatformBadge platform={resolvedPlatform} /> : null}
        </div>
        <p className="mt-0.5 text-xs text-muted-foreground">
          {conversationId
            ? "Reply within Meta's messaging window (typically 24 hours after the customer's last message)."
            : "Select a Facebook or Instagram conversation"}
        </p>
      </div>

      {!conversationId ? (
        <div className="flex flex-1 flex-col items-center justify-center bg-muted/20 px-6 text-center">
          <div className="mb-3 flex items-center gap-2 opacity-40">
            <Facebook className="h-8 w-8 text-[#1877F2]" />
            <Instagram className="h-8 w-8 text-[#E4405F]" />
          </div>
          <p className="text-sm text-muted-foreground">Select a conversation from the list.</p>
        </div>
      ) : (
        <>
          <ScrollArea className="flex-1 bg-muted/10">
            <div className="space-y-3 p-4">
              {messages.map((msg) => (
                <div
                  key={msg.id}
                  className={cn(
                    "max-w-[85%] rounded-lg px-3 py-2 text-sm",
                    msg.direction === "OUTBOUND"
                      ? "ml-auto bg-primary text-primary-foreground"
                      : "border border-border bg-white"
                  )}
                >
                  <p className="whitespace-pre-wrap">{msg.body}</p>
                  <p
                    className={cn(
                      "mt-1 text-[10px]",
                      msg.direction === "OUTBOUND"
                        ? "text-primary-foreground/70"
                        : "text-muted-foreground"
                    )}
                  >
                    {formatSmsMessageTime(msg.sentAt)}
                    {msg.direction === "OUTBOUND" && msg.sender?.name ? ` · ${msg.sender.name}` : ""}
                    {` · ${config.label}`}
                  </p>
                </div>
              ))}
            </div>
          </ScrollArea>

          <form
            onSubmit={(e) => void handleSend(e)}
            className="flex shrink-0 items-end gap-2 border-t border-border bg-white p-4"
          >
            <textarea
              rows={2}
              className="min-h-[44px] w-full min-w-0 flex-1 resize-none rounded-md border border-input bg-background px-3 py-2 text-sm"
              placeholder={`Reply on ${config.label}...`}
              value={body}
              onChange={(e) => setBody(e.target.value)}
            />
            <Button type="submit" size="icon" className="shrink-0" disabled={sending || !body.trim()}>
              <Send className="h-4 w-4" />
            </Button>
          </form>
        </>
      )}
    </div>
  );
}
