"use client";

import { useEffect, useState } from "react";
import { Send } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { BlockContactAction } from "@/components/inbox/BlockContactAction";
import { CustomerNameWithBadge } from "@/components/customers/CustomerNameWithBadge";
import { cn } from "@/lib/utils";
import type { InboxScope } from "@/lib/inbox/types";

type Message = {
  id: string;
  body: string;
  direction: "INBOUND" | "OUTBOUND";
  sentAt: string;
  sender?: { name: string } | null;
};

type Conversation = {
  id: string;
  participantPhone?: string | null;
  title?: string | null;
  customer?: {
    id: string;
    name: string;
    phone?: string | null;
    email?: string | null;
    doNotService?: boolean;
  } | null;
};

function ComposeBar({
  body,
  onBodyChange,
  onSubmit,
  sending,
  placeholder = "Type a message...",
  multiline = false,
}: {
  body: string;
  onBodyChange: (value: string) => void;
  onSubmit: (e: React.FormEvent) => void;
  sending: boolean;
  placeholder?: string;
  multiline?: boolean;
}) {
  return (
    <form
      onSubmit={onSubmit}
      className="flex shrink-0 items-end gap-2 border-t border-border bg-white p-4"
    >
      {multiline ? (
        <textarea
          rows={3}
          className="min-h-[44px] w-full min-w-0 flex-1 resize-none rounded-md border border-input bg-background px-3 py-2 text-sm"
          placeholder={placeholder}
          value={body}
          onChange={(e) => onBodyChange(e.target.value)}
        />
      ) : (
        <Input
          placeholder={placeholder}
          value={body}
          onChange={(e) => onBodyChange(e.target.value)}
          className="min-w-0 flex-1"
        />
      )}
      <Button type="submit" size="icon" className="shrink-0" disabled={sending || !body.trim()}>
        <Send className="h-4 w-4" />
      </Button>
    </form>
  );
}

export function SmsMessagePane({
  conversationId,
  scope,
  initialPhone,
  initialCustomerId,
  initialName,
}: {
  conversationId: string | null;
  scope: InboxScope;
  initialPhone?: string | null;
  initialCustomerId?: string | null;
  initialName?: string | null;
}) {
  const [conversation, setConversation] = useState<Conversation | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [body, setBody] = useState("");
  const [to, setTo] = useState("");
  const [sending, setSending] = useState(false);

  useEffect(() => {
    if (conversationId || !initialPhone) return;
    setTo(initialPhone);
  }, [conversationId, initialPhone]);

  useEffect(() => {
    if (!conversationId) {
      setConversation(null);
      setMessages([]);
      return;
    }

    async function load() {
      const res = await fetch(`/api/inbox/sms/conversations/${conversationId}/messages`);
      if (res.ok) {
        const data = await res.json();
        setConversation(data.conversation);
        setMessages(data.messages);
        if (data.conversation.participantPhone) {
          setTo(data.conversation.participantPhone);
        }
      }
    }
    load();
    const interval = setInterval(load, 5000);
    return () => clearInterval(interval);
  }, [conversationId]);

  async function handleSend(e: React.FormEvent) {
    e.preventDefault();
    if (!body.trim()) return;

    if (scope === "customers" && !conversationId && !to.trim()) {
      toast.error("Enter a phone number");
      return;
    }

    setSending(true);
    const res = await fetch("/api/inbox/sms/conversations", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        to: to || conversation?.participantPhone,
        body,
        customerId: conversation?.customer?.id ?? initialCustomerId ?? undefined,
        scope: scope === "customers" ? "external" : "internal",
        title: conversation?.title,
      }),
    });
    setSending(false);

    if (!res.ok) {
      toast.error("Failed to send message");
      return;
    }

    setBody("");
    toast.success("Message sent");
  }

  const headerName = conversationId
    ? (conversation?.customer?.name ??
      conversation?.title ??
      conversation?.participantPhone ??
      "Conversation")
    : initialName
      ? `Message ${initialName}`
      : "New message";

  const headerSubtitle =
    conversation?.participantPhone ?? (initialPhone && !conversationId ? initialPhone : null);

  return (
    <div className="flex h-full w-full min-w-0 flex-col">
      <div className="flex shrink-0 items-center justify-between border-b border-border px-4 py-3">
        <div className="min-w-0">
          {conversation?.customer?.name ? (
            <CustomerNameWithBadge
              name={conversation.customer.name}
              doNotService={conversation.customer.doNotService}
              nameClassName="truncate font-semibold"
            />
          ) : (
            <h3 className="truncate font-semibold">{headerName}</h3>
          )}
          {headerSubtitle ? (
            <p className="truncate text-xs text-muted-foreground">{headerSubtitle}</p>
          ) : null}
        </div>
        {scope === "customers" && conversation?.customer && (
          <BlockContactAction
            customerId={conversation.customer.id}
            phone={conversation.customer.phone}
            email={conversation.customer.email}
            name={conversation.customer.name}
          />
        )}
      </div>

      {scope === "customers" && !conversationId && (
        <div className="shrink-0 border-b border-border px-4 py-3">
          <Input
            placeholder="Phone number"
            value={to}
            onChange={(e) => setTo(e.target.value)}
          />
        </div>
      )}

      <div className="min-h-0 flex-1 overflow-hidden bg-muted/20">
        <ScrollArea className="h-full w-full">
          <div className="flex min-h-full flex-col p-4">
            {messages.length > 0 ? (
              <div className="space-y-3">
                {messages.map((msg) => (
                  <div
                    key={msg.id}
                    className={cn(
                      "max-w-[75%] rounded-2xl px-4 py-2 text-sm",
                      msg.direction === "OUTBOUND"
                        ? "ml-auto bg-primary text-white"
                        : "bg-white text-foreground shadow-sm"
                    )}
                  >
                    {msg.sender?.name && msg.direction === "OUTBOUND" && scope === "team" && (
                      <p className="mb-1 text-[10px] opacity-70">{msg.sender.name}</p>
                    )}
                    {msg.body}
                  </div>
                ))}
              </div>
            ) : (
              <div className="flex flex-1 items-center justify-center py-12 text-center text-sm text-muted-foreground">
                {conversationId
                  ? "No messages in this conversation yet."
                  : "Compose a message below to start the conversation."}
              </div>
            )}
          </div>
        </ScrollArea>
      </div>

      <ComposeBar
        body={body}
        onBodyChange={setBody}
        onSubmit={handleSend}
        sending={sending}
        multiline
      />
    </div>
  );
}
