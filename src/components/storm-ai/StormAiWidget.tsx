"use client";

import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { Sparkles, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { pageContextFromLocation } from "@/lib/storm-ai/page-context";
import { cn } from "@/lib/utils";

type ChatMessage = { id: string; role: string; content: string; createdAt: string };

function ChatMarkdown({ text }: { text: string }) {
  const segments = text.split(/(\*\*[^*]+?\*\*|__[^_]+?__)/g);
  return (
    <p className="whitespace-pre-wrap">
      {segments.map((segment, i) => {
        if (
          (segment.startsWith("**") && segment.endsWith("**") && segment.length >= 4) ||
          (segment.startsWith("__") && segment.endsWith("__") && segment.length >= 4)
        ) {
          return <strong key={i}>{segment.slice(2, -2)}</strong>;
        }
        return <Fragment key={i}>{segment}</Fragment>;
      })}
    </p>
  );
}

export function StormAiWidget() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [enabled, setEnabled] = useState(true);
  const [open, setOpen] = useState(false);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [draft, setDraft] = useState("");
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
        <div className="fixed bottom-20 right-4 z-[55] flex h-[min(36rem,calc(100dvh-6rem))] w-[min(100vw-2rem,24rem)] flex-col overflow-hidden rounded-xl border border-border bg-card shadow-xl sm:bottom-32">
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
          <div className="flex min-h-0 flex-1 flex-col">
            <ScrollArea className="min-h-0 flex-1">
              <div className="space-y-3 p-3 text-sm">
                {messages.length === 0 ? (
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
                      <ChatMarkdown text={m.content} />
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
      ) : null}

      <button
        type="button"
        aria-label="Open Storm AI"
        onClick={() => setOpen((v) => !v)}
        className="fixed bottom-4 right-4 z-[55] flex h-14 w-14 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg hover:bg-primary/90 sm:bottom-16"
      >
        <Sparkles className="h-6 w-6 text-white" />
      </button>
    </>
  );
}
