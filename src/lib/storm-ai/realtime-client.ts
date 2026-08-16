export type StormAiRealtimeStatus =
  | "idle"
  | "connecting"
  | "listening"
  | "speaking"
  | "tool"
  | "error"
  | "ended";

export type StormAiRealtimeCallbacks = {
  onStatus?: (status: StormAiRealtimeStatus) => void;
  onTranscript?: (role: "user" | "assistant", text: string) => void;
  onTool?: (name: string) => void;
  onError?: (message: string) => void;
  onFrameCaptured?: (info: { savedToJob: boolean; visitId: string | null }) => void;
  /** Local camera stream for full-FPS preview (video track is NOT sent to OpenAI). */
  onLocalStream?: (stream: MediaStream | null) => void;
};

type SessionResponse = {
  conversationId: string;
  clientSecret: string;
  model?: string;
  error?: string;
};

const FRAME_MIN_INTERVAL_MS = 2500;
const FRAME_MAX_EDGE = 1280;
const FRAME_JPEG_QUALITY = 0.82;

const VISUAL_QUESTION_RE =
  /\b(what|which|look|see|show|showing|this|that|valve|solenoid|controller|part|identify|tell me about|can you (see|tell))\b/i;

/**
 * Browser WebRTC client for Storm AI voice/video.
 * Audio goes to OpenAI; video stays local at full FPS — only still frames are sent.
 */
export class StormAiRealtimeClient {
  private pc: RTCPeerConnection | null = null;
  private dc: RTCDataChannel | null = null;
  private localStream: MediaStream | null = null;
  private audioEl: HTMLAudioElement | null = null;
  private previewVideo: HTMLVideoElement | null = null;
  private conversationId: string | null = null;
  private visitId: string | null = null;
  private videoMode = false;
  private pendingArgs: Record<string, string> = {};
  private closed = false;
  private lastFrameAt = 0;
  private frameInFlight = false;
  private callbacks: StormAiRealtimeCallbacks;

  constructor(callbacks: StormAiRealtimeCallbacks = {}) {
    this.callbacks = callbacks;
  }

  get activeConversationId() {
    return this.conversationId;
  }

  get isVideoMode() {
    return this.videoMode;
  }

  async start(opts: {
    conversationId?: string | null;
    pageContext?: Record<string, unknown> | null;
    videoMode?: boolean;
  }) {
    this.closed = false;
    this.videoMode = Boolean(opts.videoMode);
    this.visitId =
      typeof opts.pageContext?.visitId === "string" ? opts.pageContext.visitId : null;
    this.setStatus("connecting");

    const sessionRes = await fetch("/api/storm-ai/realtime/session", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        conversationId: opts.conversationId || undefined,
        pageContext: opts.pageContext ?? undefined,
        videoMode: this.videoMode,
      }),
    });
    const session = (await sessionRes.json().catch(() => ({}))) as SessionResponse;
    if (!sessionRes.ok || !session.clientSecret) {
      throw new Error(session.error || "Could not start voice session");
    }
    this.conversationId = session.conversationId;

    this.pc = new RTCPeerConnection();
    this.audioEl = document.createElement("audio");
    this.audioEl.autoplay = true;
    this.pc.ontrack = (event) => {
      if (this.audioEl) {
        this.audioEl.srcObject = event.streams[0] ?? null;
      }
      this.setStatus("listening");
    };

    this.localStream = await navigator.mediaDevices.getUserMedia({
      audio: true,
      video: this.videoMode
        ? {
            facingMode: { ideal: "environment" },
            width: { ideal: 1280 },
            height: { ideal: 720 },
          }
        : false,
    });

    // Audio only to OpenAI — never attach the camera track to the peer connection.
    for (const track of this.localStream.getAudioTracks()) {
      this.pc.addTrack(track, this.localStream);
    }

    if (this.videoMode) {
      this.previewVideo = document.createElement("video");
      this.previewVideo.playsInline = true;
      this.previewVideo.muted = true;
      this.previewVideo.autoplay = true;
      this.previewVideo.srcObject = this.localStream;
      await this.previewVideo.play().catch(() => undefined);
    }

    this.callbacks.onLocalStream?.(this.localStream);

    this.dc = this.pc.createDataChannel("oai-events");
    this.dc.addEventListener("message", (event) => {
      void this.onDataMessage(String(event.data));
    });

    const offer = await this.pc.createOffer();
    await this.pc.setLocalDescription(offer);

    const sdpRes = await fetch("https://api.openai.com/v1/realtime/calls", {
      method: "POST",
      body: offer.sdp ?? "",
      headers: {
        Authorization: `Bearer ${session.clientSecret}`,
        "Content-Type": "application/sdp",
      },
    });
    if (!sdpRes.ok) {
      const err = await sdpRes.text();
      throw new Error(err || "OpenAI WebRTC handshake failed");
    }
    const answerSdp = await sdpRes.text();
    await this.pc.setRemoteDescription({ type: "answer", sdp: answerSdp });

    this.setStatus("listening");
    return { conversationId: this.conversationId };
  }

  /** Manual snap while video mode is on. */
  async captureFrameNow(reason = "manual") {
    if (!this.videoMode) return;
    await this.captureAndSendFrame(reason, true);
  }

  stop() {
    this.closed = true;
    try {
      this.dc?.close();
    } catch {
      /* ignore */
    }
    try {
      this.pc?.getSenders().forEach((s) => s.track?.stop());
      this.pc?.close();
    } catch {
      /* ignore */
    }
    this.localStream?.getTracks().forEach((t) => t.stop());
    this.callbacks.onLocalStream?.(null);
    if (this.previewVideo) {
      this.previewVideo.srcObject = null;
      this.previewVideo = null;
    }
    if (this.audioEl) {
      this.audioEl.srcObject = null;
      this.audioEl = null;
    }
    this.pc = null;
    this.dc = null;
    this.localStream = null;
    this.setStatus("ended");
  }

  private setStatus(status: StormAiRealtimeStatus) {
    this.callbacks.onStatus?.(status);
  }

  private sendEvent(payload: Record<string, unknown>) {
    if (!this.dc || this.dc.readyState !== "open") return;
    this.dc.send(JSON.stringify(payload));
  }

  private grabJpegDataUrl(): string | null {
    const video = this.previewVideo;
    if (!video || video.videoWidth < 2 || video.videoHeight < 2) return null;

    const scale = Math.min(1, FRAME_MAX_EDGE / Math.max(video.videoWidth, video.videoHeight));
    const width = Math.max(1, Math.round(video.videoWidth * scale));
    const height = Math.max(1, Math.round(video.videoHeight * scale));
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    ctx.drawImage(video, 0, 0, width, height);
    return canvas.toDataURL("image/jpeg", FRAME_JPEG_QUALITY);
  }

  private async captureAndSendFrame(reason: string, force = false) {
    if (!this.videoMode || this.closed || !this.conversationId) return;
    const now = Date.now();
    if (!force && now - this.lastFrameAt < FRAME_MIN_INTERVAL_MS) return;
    if (this.frameInFlight) return;

    const dataUrl = this.grabJpegDataUrl();
    if (!dataUrl) return;

    this.frameInFlight = true;
    this.lastFrameAt = now;
    try {
      this.sendEvent({
        type: "conversation.item.create",
        item: {
          type: "message",
          role: "user",
          content: [
            {
              type: "input_image",
              image_url: dataUrl,
              detail: "high",
            },
            {
              type: "input_text",
              text: `[Live camera frame (${reason}). Use this image for what the technician is asking about.]`,
            },
          ],
        },
      });

      const res = await fetch("/api/storm-ai/realtime/frame", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          conversationId: this.conversationId,
          visitId: this.visitId || undefined,
          dataUrl,
          fileName: `storm-ai-frame-${Date.now()}.jpg`,
        }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        savedToJob?: boolean;
        visitId?: string | null;
      };
      if (res.ok) {
        this.callbacks.onFrameCaptured?.({
          savedToJob: Boolean(data.savedToJob),
          visitId: data.visitId ?? null,
        });
      }
    } finally {
      this.frameInFlight = false;
    }
  }

  private async onDataMessage(raw: string) {
    if (this.closed) return;
    let event: Record<string, unknown>;
    try {
      event = JSON.parse(raw) as Record<string, unknown>;
    } catch {
      return;
    }
    const type = String(event.type || "");

    if (type === "error") {
      const err = event.error as { message?: string } | undefined;
      this.callbacks.onError?.(err?.message || "Realtime error");
      this.setStatus("error");
      return;
    }

    if (type === "input_audio_buffer.speech_started") {
      this.setStatus("listening");
      // Capture while they start asking about what they're showing — before VAD response.
      if (this.videoMode) {
        void this.captureAndSendFrame("speech_started");
      }
      return;
    }

    if (
      type === "response.created" ||
      type === "output_audio_buffer.started" ||
      type === "response.output_audio.delta" ||
      type === "response.audio.delta"
    ) {
      this.setStatus("speaking");
      return;
    }

    if (
      type === "response.done" ||
      type === "response.cancelled" ||
      type === "output_audio_buffer.stopped"
    ) {
      this.setStatus("listening");
    }

    if (
      type === "conversation.item.input_audio_transcription.completed" ||
      type === "conversation.item.input_audio.transcription.completed"
    ) {
      const transcript = String(event.transcript || "").trim();
      if (transcript) this.callbacks.onTranscript?.("user", transcript);
      // Extra frame when the question is clearly about what they are showing.
      if (this.videoMode && transcript && VISUAL_QUESTION_RE.test(transcript)) {
        void this.captureAndSendFrame("visual_question", true);
      }
      return;
    }

    if (
      type === "response.output_audio_transcript.done" ||
      type === "response.audio_transcript.done"
    ) {
      const transcript = String(event.transcript || "").trim();
      if (transcript) this.callbacks.onTranscript?.("assistant", transcript);
      return;
    }

    if (type === "response.function_call_arguments.delta") {
      const callId = String(event.call_id || "");
      this.pendingArgs[callId] =
        (this.pendingArgs[callId] || "") + String(event.delta || "");
      return;
    }

    if (type === "response.function_call_arguments.done") {
      const callId = String(event.call_id || "");
      const name = String(event.name || "");
      const argText = String(event.arguments || this.pendingArgs[callId] || "{}");
      delete this.pendingArgs[callId];
      await this.handleToolCall(callId, name, argText);
    }
  }

  private async handleToolCall(callId: string, name: string, argText: string) {
    if (!this.conversationId) return;
    this.setStatus("tool");
    this.callbacks.onTool?.(name);

    let args: unknown = {};
    try {
      args = JSON.parse(argText || "{}");
    } catch {
      args = {};
    }

    let result: unknown = { ok: false, error: "Tool request failed" };
    try {
      const res = await fetch("/api/storm-ai/realtime/tools", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          conversationId: this.conversationId,
          callId,
          name,
          arguments: args,
        }),
      });
      result = await res.json().catch(() => ({ ok: false, error: "Invalid tool response" }));
    } catch {
      result = { ok: false, error: "Tool request failed" };
    }

    this.sendEvent({
      type: "conversation.item.create",
      item: {
        type: "function_call_output",
        call_id: callId,
        output: JSON.stringify(result),
      },
    });
    this.sendEvent({
      type: "response.create",
      response: {
        output_modalities: ["audio"],
        instructions:
          "Continue speaking briefly with the technician using the tool result. Then stop and listen.",
      },
    });
    this.setStatus("speaking");
  }
}
