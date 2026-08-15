"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { Sparkles, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { pageContextFromLocation } from "@/lib/storm-ai/page-context";
import { cn } from "@/lib/utils";

type Conversation = { id: string; title: string | null; updatedAt: string };
type ChatMessage = { id: string; role: string; content: string; createdAt: string };

export function StormAiWidget() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [enabled, setEnabled] = useState(true);
  const [open, setOpen] = useState(false);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [draft, setDraft] = useState("");
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  const pageContext = useMemo(
    () => pageContextFromLocation(pathname, searchParams.toString()),
    [pathname, searchParams]
  );

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch("/api/settings/company");
        if (!res.ok) return;
        const data = await res.json();
        if (!cancelled) setEnabled(data.showStormAiFab !== false);
      } catch {
        /* keep default on */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const loadConversations = useCallback(async () => {
    const res = await fetch("/api/storm-ai/conversations");
    if (!res.ok) return;
    const data = await res.json();
    setConversations(data.conversations ?? []);
  }, []);

  const loadConversation = useCallback(async (id: string) => {
    setLoading(true);
    try {
      const res = await fetch(`/api/storm-ai/conversations/${id}`);
      if (!res.ok) throw new Error("Could not load chat");
      const data = await res.json();
      setActiveId(id);
      setMessages(data.conversation?.messages ?? []);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not load chat");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (open) void loadConversations();
  }, [open, loadConversations]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, sending]);

  async function startNewChat() {
    const res = await fetch("/api/storm-ai/conversations", { method: "POST" });
    if (!res.ok) {
      toast.error("Could not start a new chat");
      return;
    }
    const data = await res.json();
    setActiveId(data.conversation.id);
    setMessages([]);
    await loadConversations();
  }

  async function send() {
    const content = draft.trim();
    if (!content || sending) return;
    let conversationId = activeId;
    if (!conversationId) {
      const res = await fetch("/api/storm-ai/conversations", { method: "POST" });
      if (!res.ok) {
        toast.error("Could not start a new chat");
        return;
      }
      const data = await res.json();
      conversationId = data.conversation.id as string;
      setActiveId(conversationId);
    }
    setDraft("");
    setSending(true);
    setMessages((prev) => [
      ...prev,
      {
        id: `local-${Date.now()}`,
        role: "user",
        content,
        createdAt: new Date().toISOString(),
      },
    ]);
    try {
      const res = await fetch(`/api/storm-ai/conversations/${conversationId}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content, pageContext }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? "Send failed");
      setMessages(data.messages ?? []);
      if (data.warning) toast.warning(data.warning);
      await loadConversations();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Send failed");
    } finally {
      setSending(false);
    }
  }

  if (!enabled) return null;

  return (
    <>
      {open ? (
        <div className="fixed bottom-20 right-4 z-[55] flex h-[min(36rem,calc(100dvh-6rem))] w-[min(100vw-2rem,24rem)] flex-col overflow-hidden rounded-xl border border-border bg-card shadow-xl">
          <header className="flex items-center justify-between border-b border-border px-3 py-2">
            <div className="flex items-center gap-2">
              <span className="flex h-7 w-7 items-center justify-center rounded-full bg-primary text-primary-foreground">
                <Sparkles className="h-3.5 w-3.5" />
              </span>
              <h2 className="text-sm font-semibold">Storm AI</h2>
            </div>
            <div className="flex items-center gap-1">
              <Button type="button" size="sm" variant="ghost" onClick={() => void startNewChat()}>
                New chat
              </Button>
              <Button
                type="button"
                size="icon"
                variant="ghost"
                aria-label="Close Storm AI"
                onClick={() => setOpen(false)}
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
          </header>
          <div className="grid min-h-0 flex-1 grid-cols-[7.5rem_1fr]">
            <ScrollArea className="border-r border-border">
              <div className="space-y-0.5 p-1.5">
                {conversations.map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => void loadConversation(c.id)}
                    className={cn(
                      "w-full truncate rounded-md px-2 py-1.5 text-left text-xs",
                      c.id === activeId ? "bg-accent font-medium" : "hover:bg-muted"
                    )}
                  >
                    {c.title || "New chat"}
                  </button>
                ))}
              </div>
            </ScrollArea>
            <div className="flex min-h-0 flex-col">
              <ScrollArea className="min-h-0 flex-1">
                <div className="space-y-3 p-3 text-sm">
                  {loading ? (
                    <p className="text-muted-foreground">Loading…</p>
                  ) : messages.length === 0 ? (
                    <p className="text-muted-foreground">
                      Ask about customers, the schedule, or performance. I only use CRM facts.
                    </p>
                  ) : (
                    messages.map((m) => (
                      <div
                        key={m.id}
                        className={cn(
                          "rounded-lg px-3 py-2",
                          m.role === "user" ? "ml-6 bg-primary/10" : "mr-4 bg-muted"
                        )}
                      >
                        <p className="whitespace-pre-wrap">{m.content}</p>
                      </div>
                    ))
                  )}
                  {sending ? <p className="text-xs text-muted-foreground">Thinking…</p> : null}
                  <div ref={bottomRef} />
                </div>
              </ScrollArea>
              <form
                className="flex gap-2 border-t border-border p-2"
                onSubmit={(e) => {
                  e.preventDefault();
                  void send();
                }}
              >
                <Input
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  placeholder="Ask Storm AI…"
                  disabled={sending}
                />
                <Button type="submit" size="sm" disabled={sending || !draft.trim()}>
                  Send
                </Button>
              </form>
            </div>
          </div>
        </div>
      ) : null}

      <button
        type="button"
        aria-label="Open Storm AI"
        onClick={() => setOpen((v) => !v)}
        className="fixed bottom-4 right-4 z-[55] flex h-14 w-14 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg hover:bg-primary/90"
      >
        <Sparkles className="h-6 w-6 text-white" />
      </button>
    </>
  );
}
