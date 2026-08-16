"use client";

import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { ImagePlus, Mic, MicOff, Sparkles, Video, VideoOff, Camera, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { pageContextFromLocation } from "@/lib/storm-ai/page-context";
import {
  StormAiRealtimeClient,
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

export function StormAiWidget() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [enabled, setEnabled] = useState(true);
  const [open, setOpen] = useState(false);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [draft, setDraft] = useState("");
  const [pendingImages, setPendingImages] = useState<PendingImage[]>([]);
  const [sending, setSending] = useState(false);
  const [voiceStatus, setVoiceStatus] = useState<StormAiRealtimeStatus>("idle");
  const [voiceTool, setVoiceTool] = useState<string | null>(null);
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

  useEffect(() => {
    return () => {
      voiceClientRef.current?.stop();
      voiceClientRef.current = null;
    };
  }, []);

  useEffect(() => {
    const el = previewVideoRef.current;
    if (!el) return;
    el.srcObject = localPreviewStream;
    if (localPreviewStream) {
      void el.play().catch(() => undefined);
    }
  }, [localPreviewStream]);

  function stopVoice() {
    voiceClientRef.current?.stop();
    voiceClientRef.current = null;
    setVoiceStatus("idle");
    setVoiceTool(null);
    setVideoMode(false);
    setLocalPreviewStream(null);
  }

  async function startRealtime(withVideo: boolean) {
    if (voiceActive) {
      stopVoice();
      return;
    }
    if (sending) return;
    setVideoMode(withVideo);
    const client = new StormAiRealtimeClient({
      onStatus: (status) => {
        setVoiceStatus(status);
        if (status === "ended" || status === "idle") setVoiceTool(null);
      },
      onTranscript: (role, text) => {
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
      onTool: (name) => setVoiceTool(name),
      onError: (message) => toast.error(message),
      onLocalStream: (stream) => setLocalPreviewStream(stream),
      onFrameCaptured: (info) => {
        if (info.savedToJob) {
          toast.success("Frame saved to job attachments");
        }
      },
    });
    voiceClientRef.current = client;
    try {
      const { conversationId } = await client.start({
        conversationId: activeId,
        pageContext,
        videoMode: withVideo,
      });
      setActiveId(conversationId);
    } catch (err) {
      stopVoice();
      toast.error(err instanceof Error ? err.message : "Realtime failed");
    }
  }

  async function toggleVoice() {
    await startRealtime(false);
  }

  async function toggleVideo() {
    await startRealtime(true);
  }

  async function startNewChat() {
    stopVoice();
    const res = await fetch("/api/storm-ai/conversations", { method: "POST" });
    if (!res.ok) {
      toast.error("Could not start a new chat");
      return;
    }
    const data = await res.json();
    setActiveId(data.conversation.id);
    setMessages([]);
    setPendingImages([]);
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
      if (data.warning) toast.warning(data.warning);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Send failed");
    } finally {
      setSending(false);
    }
  }

  if (!enabled) return null;

  const canSend = !sending && (!!draft.trim() || pendingImages.length > 0);

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
                onClick={() => {
                  stopVoice();
                  setOpen(false);
                }}
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
          </header>
          <div className="flex min-h-0 flex-1 flex-col">
            <ScrollArea className="min-h-0 flex-1">
              <div className="space-y-3 p-3 text-sm">
                {messages.length === 0 && !voiceActive ? (
                  <p className="text-muted-foreground">
                    Ask about customers, attach a part photo, or use mic / video for live help.
                    Video shows full FPS locally; only still frames go to the AI and are saved to
                    the job.
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
                      {m.attachments?.length ? (
                        <div className="mb-2 flex flex-wrap gap-2">
                          {m.attachments.map((att) => (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img
                              key={att.url}
                              src={att.url}
                              alt={att.fileName}
                              className="h-24 w-24 rounded-md object-cover"
                            />
                          ))}
                        </div>
                      ) : null}
                      <ChatMarkdown text={m.content} />
                    </div>
                  ))
                )}
                {sending ? <p className="text-xs text-muted-foreground">Thinking…</p> : null}
                {voiceActive ? (
                  <p className="text-xs text-muted-foreground">
                    {voiceStatus === "connecting"
                      ? videoMode
                        ? "Connecting video…"
                        : "Connecting voice…"
                      : voiceStatus === "tool"
                        ? `Looking up ${voiceTool ?? "CRM data"}…`
                        : voiceStatus === "speaking"
                          ? "Storm AI speaking…"
                          : videoMode
                            ? "Listening — point the camera and ask about what you see"
                            : "Listening — speak anytime"}
                  </p>
                ) : null}
                {voiceActive && videoMode ? (
                  <div className="space-y-2">
                    <video
                      ref={previewVideoRef}
                      className="aspect-video w-full rounded-lg bg-black object-cover"
                      playsInline
                      muted
                      autoPlay
                    />
                    <Button
                      type="button"
                      size="sm"
                      variant="secondary"
                      className="w-full"
                      onClick={() => void voiceClientRef.current?.captureFrameNow()}
                    >
                      <Camera className="mr-1.5 h-3.5 w-3.5" />
                      Snap frame for AI
                    </Button>
                  </div>
                ) : null}
                <div ref={bottomRef} />
              </div>
            </ScrollArea>
            {pendingImages.length > 0 ? (
              <div className="flex flex-wrap gap-2 border-t border-border px-2 pt-2">
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
              className="flex gap-2 border-t border-border p-2"
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
                disabled={sending || voiceActive || pendingImages.length >= MAX_PENDING}
                onClick={() => fileInputRef.current?.click()}
              >
                <ImagePlus className="h-4 w-4" />
              </Button>
              <Button
                type="button"
                size="icon"
                variant={voiceActive && !videoMode ? "default" : "ghost"}
                aria-label={voiceActive && !videoMode ? "End voice" : "Start voice"}
                disabled={sending || (voiceActive && videoMode)}
                onClick={() => void toggleVoice()}
              >
                {voiceActive && !videoMode ? (
                  <MicOff className="h-4 w-4" />
                ) : (
                  <Mic className="h-4 w-4" />
                )}
              </Button>
              <Button
                type="button"
                size="icon"
                variant={voiceActive && videoMode ? "default" : "ghost"}
                aria-label={voiceActive && videoMode ? "End video" : "Start video"}
                disabled={sending || (voiceActive && !videoMode)}
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
                disabled={sending || voiceActive}
              />
              <Button type="submit" size="sm" disabled={!canSend || voiceActive}>
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
