"use client";

import { useEffect, useState } from "react";
import { Send } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { BlockContactAction } from "@/components/inbox/BlockContactAction";
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
  customer?: { id: string; name: string; phone?: string | null; email?: string | null } | null;
};

export function SmsMessagePane({
  conversationId,
  scope,
}: {
  conversationId: string | null;
  scope: InboxScope;
}) {
  const [conversation, setConversation] = useState<Conversation | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [body, setBody] = useState("");
  const [to, setTo] = useState("");
  const [sending, setSending] = useState(false);

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

    setSending(true);
    const res = await fetch("/api/inbox/sms/conversations", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        to: to || conversation?.participantPhone,
        body,
        customerId: conversation?.customer?.id,
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

  if (!conversationId) {
    return (
      <div className="flex h-full flex-col">
        <div className="border-b border-border p-4">
          <h3 className="font-semibold">New message</h3>
        </div>
        <form onSubmit={handleSend} className="flex flex-1 flex-col p-4">
          {scope === "customers" && (
            <Input
              placeholder="Phone number"
              value={to}
              onChange={(e) => setTo(e.target.value)}
              className="mb-3"
            />
          )}
          <textarea
            className="mb-3 min-h-[120px] flex-1 rounded-md border border-input p-3 text-sm"
            placeholder="Type a message..."
            value={body}
            onChange={(e) => setBody(e.target.value)}
          />
          <Button type="submit" disabled={sending}>
            <Send className="h-4 w-4" />
            Send
          </Button>
        </form>
      </div>
    );
  }

  const headerName =
    conversation?.customer?.name ?? conversation?.title ?? conversation?.participantPhone ?? "Conversation";

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between border-b border-border px-4 py-3">
        <div>
          <h3 className="font-semibold">{headerName}</h3>
          {conversation?.participantPhone && (
            <p className="text-xs text-muted-foreground">{conversation.participantPhone}</p>
          )}
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

      <ScrollArea className="flex-1 p-4">
        <div className="space-y-3">
          {messages.map((msg) => (
            <div
              key={msg.id}
              className={cn(
                "max-w-[80%] rounded-lg px-3 py-2 text-sm",
                msg.direction === "OUTBOUND"
                  ? "ml-auto bg-primary text-white"
                  : "bg-muted text-foreground"
              )}
            >
              {msg.sender?.name && msg.direction === "OUTBOUND" && scope === "team" && (
                <p className="mb-1 text-[10px] opacity-70">{msg.sender.name}</p>
              )}
              {msg.body}
            </div>
          ))}
        </div>
      </ScrollArea>

      <form onSubmit={handleSend} className="flex gap-2 border-t border-border p-4">
        <Input
          placeholder="Type a message..."
          value={body}
          onChange={(e) => setBody(e.target.value)}
        />
        <Button type="submit" size="icon" disabled={sending}>
          <Send className="h-4 w-4" />
        </Button>
      </form>
    </div>
  );
}
