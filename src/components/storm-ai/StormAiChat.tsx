"use client";

import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import {
  ChevronDown,
  Download,
  ImagePlus,
  Mic,
  MicOff,
  Sparkles,
  Video,
  VideoOff,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { ContentArea } from "@/components/layout/ContentArea";
import { PageHeader } from "@/components/layout/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { pageContextFromLocation } from "@/lib/storm-ai/page-context";
import {
  StormAiRealtimeClient,
  type StormAiPartsCardPayload,
  type StormAiRealtimeActivity,
  type StormAiRealtimeStatus,
} from "@/lib/storm-ai/realtime-client";
import { cn } from "@/lib/utils";

type ChatAttachment = {
  fileName: string;
  mimeType: string;
  kind: "image";
  url: string;
};

type ChatMessage = {
  id: string;
  role: string;
  content: string;
  createdAt: string;
  attachments?: ChatAttachment[];
  partsCard?: StormAiPartsCardPayload | null;
};

type ChatThread = {
  id: string;
  title: string | null;
  createdAt?: string;
  updatedAt?: string;
};

type PendingImage = {
  id: string;
  dataUrl: string;
  fileName: string;
  mimeType: string;
};

const MAX_PENDING = 4;
const MAX_EDGE = 1600;
const JPEG_QUALITY = 0.82;

function trimTrailingUrlJunk(url: string) {
  return url.replace(/[.,;:!?)\]\}]+$/g, "");
}

function ChatMarkdown({ text }: { text: string }) {
  const pattern =
    /(\[[^\]]+\]\([^)\s]+\)|\*\*[^*]+?\*\*|__[^_]+?__|https?:\/\/[^\s<>\[\]"'`]+|\/api\/blob\?[^\s<>\[\]"'`]+)/g;
  const segments = text.split(pattern);

  return (
    <p className="whitespace-pre-wrap">
      {segments.map((segment, i) => {
        if (!segment) return null;

        const mdLink = segment.match(/^\[([^\]]+)\]\(([^)\s]+)\)$/);
        if (mdLink) {
          const href = mdLink[2];
          const label = mdLink[1];
          return (
            <a
              key={i}
              href={href}
              target="_blank"
              rel="noreferrer"
              className="font-medium text-primary underline underline-offset-2"
            >
              {label}
            </a>
          );
        }

        if (
          (segment.startsWith("**") && segment.endsWith("**") && segment.length >= 4) ||
          (segment.startsWith("__") && segment.endsWith("__") && segment.length >= 4)
        ) {
          return <strong key={i}>{segment.slice(2, -2)}</strong>;
        }

        if (/^https?:\/\//i.test(segment) || segment.startsWith("/api/blob?")) {
          const href = trimTrailingUrlJunk(segment);
          const junk = segment.slice(href.length);
          const isBlobProxy = href.includes("/api/blob?");
          return (
            <Fragment key={i}>
              <a
                href={href}
                target="_blank"
                rel="noreferrer"
                className="break-all font-medium text-primary underline underline-offset-2"
              >
                {isBlobProxy ? "Open manual" : href}
              </a>
              {junk}
            </Fragment>
          );
        }

        return <Fragment key={i}>{segment}</Fragment>;
      })}
    </p>
  );
}

function PartsInfoCard({ card }: { card: StormAiPartsCardPayload }) {
  const meta = [card.manufacturer, card.partNumber, card.section].filter(Boolean).join(" · ");
  const summary =
    card.summary?.trim() ||
    [card.name + (meta ? `. ${meta}` : "")].join("");
  const photos = Array.isArray(card.photos) ? card.photos : [];
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <p className="font-medium">{card.name}</p>
        {card.visuallyConfirmed ? (
          <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-emerald-800">
            Photo match
          </span>
        ) : null}
      </div>
      {photos.length > 0 ? (
        <div className="flex flex-wrap gap-2">
          {photos.map((photo) => {
            const confirmed =
              Boolean(card.confirmedPhotoId) && photo.id === card.confirmedPhotoId;
            return (
              <div key={photo.url} className="relative">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={photo.url}
                  alt={photo.fileName || card.name}
                  className={cn(
                    "h-28 w-28 rounded-md object-cover",
                    confirmed ? "ring-2 ring-emerald-500 ring-offset-2" : ""
                  )}
                />
                {confirmed ? (
                  <span className="absolute left-1 top-1 rounded bg-emerald-600 px-1.5 py-0.5 text-[10px] font-semibold text-white">
                    Match
                  </span>
                ) : null}
              </div>
            );
          })}
        </div>
      ) : null}
      {summary ? <p className="text-sm whitespace-pre-wrap">{summary}</p> : null}
      {card.manualUrl ? (
        <a
          href={card.manualUrl}
          target="_blank"
          rel="noreferrer"
          className="inline-flex text-sm font-medium text-primary underline underline-offset-2"
        >
          Open manual{card.manualKind === "pdf" ? " (PDF)" : ""}
        </a>
      ) : null}
    </div>
  );
}

function appendPartsCardMessage(
  prev: ChatMessage[],
  card: StormAiPartsCardPayload
): ChatMessage[] {
  if (prev.some((m) => m.partsCard?.partId === card.partId && m.role === "assistant")) {
    return prev;
  }
  const lines = [card.summary?.trim() || `**${card.name}**`];
  return [
    ...prev,
    {
      id: `parts-${card.partId}-${Date.now()}`,
      role: "assistant",
      content: lines.join("\n"),
      createdAt: new Date().toISOString(),
      partsCard: card,
    },
  ];
}

async function fileToCompressedDataUrl(file: File): Promise<PendingImage | null> {
  if (!file.type.startsWith("image/")) return null;
  const objectUrl = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error("Could not read image"));
      el.src = objectUrl;
    });
    const scale = Math.min(1, MAX_EDGE / Math.max(img.width, img.height));
    const width = Math.max(1, Math.round(img.width * scale));
    const height = Math.max(1, Math.round(img.height * scale));
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    ctx.drawImage(img, 0, 0, width, height);
    const mimeType = file.type === "image/png" ? "image/png" : "image/jpeg";
    const dataUrl =
      mimeType === "image/png"
        ? canvas.toDataURL("image/png")
        : canvas.toDataURL("image/jpeg", JPEG_QUALITY);
    return {
      id: `pending-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      dataUrl,
      fileName: file.name || "photo.jpg",
      mimeType,
    };
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

export function StormAiChat() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [enabled, setEnabled] = useState(true);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [threads, setThreads] = useState<ChatThread[]>([]);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [draft, setDraft] = useState("");
  const [pendingImages, setPendingImages] = useState<PendingImage[]>([]);
  const [sending, setSending] = useState(false);
  const [voiceStatus, setVoiceStatus] = useState<StormAiRealtimeStatus>("idle");
  const [voiceTool, setVoiceTool] = useState<string | null>(null);
  const [voiceActivity, setVoiceActivity] = useState<StormAiRealtimeActivity[]>([]);
  const [chatFault, setChatFault] = useState(false);
  const [activityExportMeta, setActivityExportMeta] = useState<{
    videoMode: boolean;
  }>({ videoMode: false });
  const [videoMode, setVideoMode] = useState(false);
  const [localPreviewStream, setLocalPreviewStream] = useState<MediaStream | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const voiceClientRef = useRef<StormAiRealtimeClient | null>(null);
  const previewVideoRef = useRef<HTMLVideoElement>(null);

  const voiceActive =
    voiceStatus === "connecting" ||
    voiceStatus === "listening" ||
    voiceStatus === "speaking" ||
    voiceStatus === "tool";

  const pageContext = useMemo(
    () => pageContextFromLocation(pathname, searchParams.toString()),
    [pathname, searchParams]
  );

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch("/api/storm-ai/conversations");
        if (!res.ok) return;
        const data = (await res.json()) as { conversations?: ChatThread[] };
        if (!cancelled) setThreads(data.conversations ?? []);
      } catch {
        /* history is optional */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

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
  }, [messages, sending, voiceStatus]);

  const liveStatus = useMemo(() => {
    if (voiceStatus === "error" || chatFault) {
      return { color: "red" as const, label: "Error" };
    }
    if (sending || voiceStatus === "connecting" || voiceStatus === "tool" || voiceStatus === "speaking") {
      const label =
        voiceStatus === "connecting"
          ? videoMode
            ? "Connecting video…"
            : "Connecting…"
          : voiceStatus === "tool"
            ? `Looking up ${voiceTool ?? "CRM data"}…`
            : voiceStatus === "speaking"
              ? "Speaking…"
              : "Thinking…";
      return { color: "yellow" as const, label };
    }
    if (voiceStatus === "listening") {
      return {
        color: "green" as const,
        label: videoMode
          ? "Listening — point the camera and ask"
          : "Listening",
      };
    }
    return null;
  }, [chatFault, sending, videoMode, voiceStatus, voiceTool]);

  const latestPartsCard = useMemo(() => {
    for (let i = messages.length - 1; i >= 0; i -= 1) {
      const card = messages[i]?.partsCard;
      if (card) return card;
    }
    return null;
  }, [messages]);

  useEffect(() => {
    return () => {
      voiceClientRef.current?.stop();
      voiceClientRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (!videoMode) return;
    const el = previewVideoRef.current;
    if (!el) return;
    el.srcObject = localPreviewStream;
    if (localPreviewStream) {
      void el.play().catch(() => undefined);
    }
  }, [localPreviewStream, videoMode]);

  function pushVoiceActivity(entry: StormAiRealtimeActivity) {
    // Keep a larger ring buffer so exported debug logs cover full AI paths.
    setVoiceActivity((prev) => [...prev.slice(-199), entry]);
  }

  function resetVoiceActivity(nextVideoMode = false) {
    setVoiceActivity([]);
    setActivityExportMeta({ videoMode: nextVideoMode });
    setChatFault(false);
  }

  function exportVoiceActivity() {
    if (voiceActivity.length === 0) {
      toast.error("No live steps to export yet");
      return;
    }
    const payload = {
      exportedAt: new Date().toISOString(),
      source: "storm-ai-live-debug",
      conversationId: activeId,
      videoMode: activityExportMeta.videoMode || videoMode,
      status: voiceStatus,
      entryCount: voiceActivity.length,
      entries: voiceActivity.map((entry, index) => ({
        seq: index + 1,
        at: entry.at,
        iso: new Date(entry.at).toISOString(),
        level: entry.level,
        message: entry.message,
      })),
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
    const a = document.createElement("a");
    a.href = url;
    a.download = `storm-ai-debug-${stamp}.json`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success("Debug log exported as JSON");
  }

  function stopVoice() {
    voiceClientRef.current?.stop();
    voiceClientRef.current = null;
    setVoiceStatus("idle");
    setVoiceTool(null);
    setVideoMode(false);
    setLocalPreviewStream(null);
    // Keep voiceActivity so the session can still be exported after hang-up.
  }

  function realtimeCallbacks(base?: {
    onLocalStream?: (stream: MediaStream | null) => void;
  }) {
    return {
      onStatus: (status: StormAiRealtimeStatus) => {
        setVoiceStatus(status);
        if (status === "ended" || status === "idle") setVoiceTool(null);
        if (status !== "error" && status !== "idle" && status !== "ended") {
          setChatFault(false);
        }
      },
      onTranscript: (role: "user" | "assistant", text: string) => {
        setMessages((prev) => [
          ...prev,
          {
            id: `voice-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
            role: role === "user" ? "user" : "assistant",
            content: text,
            createdAt: new Date().toISOString(),
          },
        ]);
      },
      onTool: (name: string) => setVoiceTool(name),
      onError: (message: string) => {
        setChatFault(true);
        toast.error(message);
      },
      onLocalStream: (stream: MediaStream | null) => {
        setLocalPreviewStream(stream);
        base?.onLocalStream?.(stream);
      },
      onVideoModeChange: (enabled: boolean) => {
        setVideoMode(enabled);
        setActivityExportMeta((prev) => ({ ...prev, videoMode: enabled || prev.videoMode }));
      },
      onPartsCard: (card: StormAiPartsCardPayload) =>
        setMessages((prev) => appendPartsCardMessage(prev, card)),
      onActivity: pushVoiceActivity,
      onFrameCaptured: (info: { savedToJob: boolean; visitId: string | null }) => {
        if (info.savedToJob) {
          toast.success("Frame saved to job attachments");
        }
      },
    };
  }

  async function ensureRealtimeClient() {
    if (voiceClientRef.current?.isActive) return voiceClientRef.current;
    if (sending) return null;
    resetVoiceActivity(false);
    const client = new StormAiRealtimeClient(realtimeCallbacks());
    voiceClientRef.current = client;
    try {
      const { conversationId } = await client.start({
        conversationId: activeId,
        pageContext,
        videoMode: false,
      });
      setActiveId(conversationId);
      return client;
    } catch (err) {
      stopVoice();
      toast.error(err instanceof Error ? err.message : "Realtime failed");
      return null;
    }
  }

  async function toggleVoice() {
    if (voiceActive) {
      stopVoice();
      return;
    }
    setVideoMode(false);
    await ensureRealtimeClient();
  }

  async function toggleVideo() {
    if (sending) return;

    // Already in a live session: toggle camera without dropping the conversation.
    if (voiceClientRef.current?.isActive) {
      try {
        if (voiceClientRef.current.isVideoMode) {
          voiceClientRef.current.disableVideo();
        } else {
          await voiceClientRef.current.enableVideo();
        }
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Could not toggle video");
      }
      return;
    }

    // Start a new realtime session with video (same chat conversation id).
    setVideoMode(true);
    resetVoiceActivity(true);
    const client = new StormAiRealtimeClient(realtimeCallbacks());
    voiceClientRef.current = client;
    try {
      const { conversationId } = await client.start({
        conversationId: activeId,
        pageContext,
        videoMode: true,
      });
      setActiveId(conversationId);
    } catch (err) {
      stopVoice();
      toast.error(err instanceof Error ? err.message : "Realtime failed");
    }
  }

  async function refreshThreads() {
    try {
      const res = await fetch("/api/storm-ai/conversations");
      if (!res.ok) return;
      const data = (await res.json()) as { conversations?: ChatThread[] };
      setThreads(data.conversations ?? []);
    } catch {
      /* ignore */
    }
  }

  async function openThread(id: string) {
    stopVoice();
    resetVoiceActivity(false);
    setHistoryOpen(false);
    try {
      const res = await fetch(`/api/storm-ai/conversations/${id}`);
      if (!res.ok) {
        toast.error("Could not open that chat");
        return;
      }
      const data = (await res.json()) as {
        conversation?: { id: string; messages?: ChatMessage[] };
      };
      setActiveId(data.conversation?.id ?? id);
      setMessages(data.conversation?.messages ?? []);
      setPendingImages([]);
    } catch {
      toast.error("Could not open that chat");
    }
  }

  async function startNewChat() {
    stopVoice();
    resetVoiceActivity(false);
    const res = await fetch("/api/storm-ai/conversations", { method: "POST" });
    if (!res.ok) {
      toast.error("Could not start a new chat");
      return;
    }
    const data = await res.json();
    setActiveId(data.conversation.id);
    setMessages([]);
    setPendingImages([]);
    setHistoryOpen(false);
    void refreshThreads();
  }

  async function onPickFiles(files: FileList | null) {
    if (!files?.length) return;
    const remaining = MAX_PENDING - pendingImages.length;
    if (remaining <= 0) {
      toast.error(`You can attach up to ${MAX_PENDING} photos`);
      return;
    }
    const next: PendingImage[] = [];
    for (const file of Array.from(files).slice(0, remaining)) {
      try {
        const compressed = await fileToCompressedDataUrl(file);
        if (compressed) next.push(compressed);
      } catch {
        toast.error(`Could not read ${file.name}`);
      }
    }
    if (next.length) setPendingImages((prev) => [...prev, ...next]);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  async function send() {
    const content = draft.trim();
    if ((!content && pendingImages.length === 0) || sending) return;
    // Keep one conversation: end live voice/video first, then continue in text.
    if (voiceActive) stopVoice();
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
    const imagesPayload = pendingImages.map((img) => ({
      dataUrl: img.dataUrl,
      fileName: img.fileName,
      mimeType: img.mimeType,
    }));
    const optimisticAttachments: ChatAttachment[] = pendingImages.map((img) => ({
      fileName: img.fileName,
      mimeType: img.mimeType,
      kind: "image",
      url: img.dataUrl,
    }));
    setDraft("");
    setPendingImages([]);
    setSending(true);
    setChatFault(false);
    setMessages((prev) => [
      ...prev,
      {
        id: `local-${Date.now()}`,
        role: "user",
        content: content || "What part is this?",
        createdAt: new Date().toISOString(),
        attachments: optimisticAttachments,
      },
    ]);
    try {
      const res = await fetch(`/api/storm-ai/conversations/${conversationId}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          content,
          images: imagesPayload.length ? imagesPayload : undefined,
          pageContext,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? "Send failed");
      setMessages(data.messages ?? []);
      if (data.warning) {
        setChatFault(true);
        toast.warning(data.warning);
      }
      void refreshThreads();
    } catch (err) {
      setChatFault(true);
      toast.error(err instanceof Error ? err.message : "Send failed");
    } finally {
      setSending(false);
    }
  }

  if (!enabled) {
    return (
      <ContentArea>
        <PageHeader
          title="Storm AI"
          subtitle="Assistant for CRM lookups, parts ID, and field diagnostics"
        />
        <p className="text-sm text-muted-foreground">
          Storm AI is turned off for this company. Enable it under Settings → Storm AI.
        </p>
      </ContentArea>
    );
  }

  const canSend = !sending && (!!draft.trim() || pendingImages.length > 0);

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden">
      <ContentArea className="flex min-h-0 flex-1 flex-col pb-3">
        <PageHeader
          className="mb-3 shrink-0"
          title={
            <span className="inline-flex items-center gap-2">
              <span className="flex h-8 w-8 items-center justify-center rounded-full bg-primary text-primary-foreground">
                <Sparkles className="h-4 w-4" />
              </span>
              Storm AI
            </span>
          }
          subtitle="Ask about customers, attach a part photo, or use mic / video for live help"
          actions={
            <div className="flex items-center gap-2">
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={voiceActivity.length === 0}
                onClick={exportVoiceActivity}
              >
                <Download className="mr-1.5 h-3.5 w-3.5" />
                Export debug
              </Button>
              <Button type="button" size="sm" variant="outline" onClick={() => void startNewChat()}>
                New chat
              </Button>
            </div>
          }
        />

        {threads.length > 0 ? (
          <div className="mb-3 shrink-0 rounded-lg border border-border bg-muted/40">
            <button
              type="button"
              className="flex w-full items-center justify-between px-3 py-2 text-left text-sm font-medium"
              onClick={() => setHistoryOpen((open) => !open)}
              aria-expanded={historyOpen}
            >
              Past chats
              <ChevronDown
                className={cn("h-4 w-4 text-muted-foreground transition-transform", historyOpen && "rotate-180")}
              />
            </button>
            {historyOpen ? (
              <ul className="max-h-48 space-y-0.5 overflow-y-auto border-t border-border px-2 py-2">
                {threads.map((thread) => (
                  <li key={thread.id}>
                    <button
                      type="button"
                      className={cn(
                        "w-full rounded-md px-2 py-1.5 text-left text-sm hover:bg-background",
                        thread.id === activeId && "bg-background font-medium"
                      )}
                      onClick={() => void openThread(thread.id)}
                    >
                      <span className="block truncate">
                        {thread.title?.trim() || "Untitled chat"}
                      </span>
                      {thread.updatedAt ? (
                        <span className="text-xs text-muted-foreground">
                          {new Date(thread.updatedAt).toLocaleString()}
                        </span>
                      ) : null}
                    </button>
                  </li>
                ))}
              </ul>
            ) : null}
          </div>
        ) : null}

        <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl border border-border bg-card">
          {liveStatus ? (
            <div className="flex shrink-0 items-center gap-2 border-b border-border px-4 py-2 sm:px-6">
              <span
                className={cn(
                  "h-2.5 w-2.5 shrink-0 rounded-full",
                  liveStatus.color === "green" && "bg-emerald-500 shadow-[0_0_0_3px_rgba(16,185,129,0.25)] animate-pulse",
                  liveStatus.color === "yellow" && "bg-amber-400 shadow-[0_0_0_3px_rgba(251,191,36,0.25)] animate-pulse",
                  liveStatus.color === "red" && "bg-red-500 shadow-[0_0_0_3px_rgba(239,68,68,0.25)]"
                )}
                aria-hidden
              />
              <p className="truncate text-xs font-medium text-foreground" role="status">
                {liveStatus.label}
              </p>
            </div>
          ) : null}
          <ScrollArea className="min-h-0 flex-1">
            <div className="mx-auto w-full max-w-3xl space-y-3 p-4 text-sm sm:p-6">
              {messages.length === 0 && !voiceActive ? (
                <p className="text-muted-foreground">
                    Ask about customers, attach a part photo, or use mic / video for live help.
                    Video shows full FPS locally; a still is sent to the AI when you ask
                    about what you are showing (and saved to the job when linked).
                </p>
              ) : (
                messages.map((m) => (
                  <div
                    key={m.id}
                    className={cn(
                      "rounded-lg px-3 py-2 sm:px-4 sm:py-3",
                      m.role === "user" ? "ml-8 bg-primary/10 sm:ml-16" : "mr-8 bg-muted sm:mr-16"
                    )}
                  >
                    {m.attachments?.length ? (
                      <div className="mb-2 flex flex-wrap gap-2">
                        {m.attachments.map((att) => (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            key={att.url}
                            src={att.url}
                            alt={att.fileName}
                            className="h-28 w-28 rounded-md object-cover"
                          />
                        ))}
                      </div>
                    ) : null}
                    {m.partsCard ? (
                      <PartsInfoCard card={m.partsCard} />
                    ) : (
                      <ChatMarkdown text={m.content} />
                    )}
                  </div>
                ))
              )}
              {voiceActive && latestPartsCard ? (
                <div className="rounded-lg border border-primary/30 bg-primary/5 px-3 py-2">
                  <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-primary">
                    Parts card
                  </p>
                  <PartsInfoCard card={latestPartsCard} />
                </div>
              ) : null}
              {voiceActive && videoMode ? (
                <div className="mx-auto max-w-lg space-y-2">
                  <video
                    ref={previewVideoRef}
                    className="aspect-video w-full rounded-lg bg-black object-cover"
                    playsInline
                    muted
                    autoPlay
                  />
                  <p className="text-center text-xs text-muted-foreground">
                    Live preview — a still is sent when you ask about what you see
                  </p>
                </div>
              ) : null}
              <div ref={bottomRef} />
            </div>
          </ScrollArea>

          {pendingImages.length > 0 ? (
            <div className="mx-auto flex w-full max-w-3xl flex-wrap gap-2 border-t border-border px-4 pt-3 sm:px-6">
              {pendingImages.map((img) => (
                <div key={img.id} className="relative">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={img.dataUrl}
                    alt={img.fileName}
                    className="h-14 w-14 rounded-md object-cover"
                  />
                  <button
                    type="button"
                    aria-label="Remove photo"
                    className="absolute -right-1 -top-1 flex h-5 w-5 items-center justify-center rounded-full bg-background text-foreground shadow"
                    onClick={() =>
                      setPendingImages((prev) => prev.filter((p) => p.id !== img.id))
                    }
                  >
                    <X className="h-3 w-3" />
                  </button>
                </div>
              ))}
            </div>
          ) : null}

          <form
            className="mx-auto flex w-full max-w-3xl gap-2 border-t border-border p-3 sm:p-4"
            onSubmit={(e) => {
              e.preventDefault();
              void send();
            }}
          >
            <input
              ref={fileInputRef}
              type="file"
              accept="image/jpeg,image/png,image/webp,image/gif"
              multiple
              className="hidden"
              onChange={(e) => void onPickFiles(e.target.files)}
            />
            <Button
              type="button"
              size="icon"
              variant="ghost"
              aria-label="Attach photo"
              disabled={sending || pendingImages.length >= MAX_PENDING}
              onClick={() => fileInputRef.current?.click()}
            >
              <ImagePlus className="h-4 w-4" />
            </Button>
            <Button
              type="button"
              size="icon"
              variant={voiceActive ? "default" : "ghost"}
              aria-label={voiceActive ? "End voice" : "Start voice"}
              disabled={sending}
              onClick={() => void toggleVoice()}
            >
              {voiceActive ? <MicOff className="h-4 w-4" /> : <Mic className="h-4 w-4" />}
            </Button>
            <Button
              type="button"
              size="icon"
              variant={voiceActive && videoMode ? "default" : "ghost"}
              aria-label={
                voiceActive && videoMode
                  ? "Turn camera off"
                  : voiceActive
                    ? "Turn camera on"
                    : "Start video"
              }
              disabled={sending}
              onClick={() => void toggleVideo()}
            >
              {voiceActive && videoMode ? (
                <VideoOff className="h-4 w-4" />
              ) : (
                <Video className="h-4 w-4" />
              )}
            </Button>
            <Input
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              placeholder="Ask Storm AI… or use mic / video"
              disabled={sending}
              className="flex-1"
            />
            <Button type="submit" size="sm" disabled={!canSend}>
              Send
            </Button>
          </form>
        </div>
      </ContentArea>
    </div>
  );
}
