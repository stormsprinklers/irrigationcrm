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
  onVideoModeChange?: (enabled: boolean) => void;
};

type SessionResponse = {
  conversationId: string;
  clientSecret: string;
  model?: string;
  error?: string;
};

const FRAME_MIN_INTERVAL_MS = 2200;
const FRAME_PERIODIC_MS = 3200;
const FRAME_MAX_EDGE = 1280;
const FRAME_JPEG_QUALITY = 0.82;
const TOOL_TIMEOUT_MS = 25_000;

const VISUAL_QUESTION_RE =
  /\b(what|which|look|see|show|showing|this|that|valve|solenoid|controller|part|identify|tell me about|can you (see|tell)|manual)\b/i;

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
  private pendingNames: Record<string, string> = {};
  private handledCallIds = new Set<string>();
  private closed = false;
  private lastFrameAt = 0;
  private frameInFlight = false;
  private frameTimer: ReturnType<typeof setInterval> | null = null;
  /** While true, do not inject camera/user items (would sit between function_call and output). */
  private suppressUserItems = false;
  private eventChain: Promise<void> = Promise.resolve();
  /** Prefetch tool HTTP while the model finishes speaking "let me look that up". */
  private toolPrefetch = new Map<string, Promise<unknown>>();
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

  get isActive() {
    return Boolean(this.pc && !this.closed);
  }

  async start(opts: {
    conversationId?: string | null;
    pageContext?: Record<string, unknown> | null;
    videoMode?: boolean;
  }) {
    this.closed = false;
    this.handledCallIds.clear();
    this.suppressUserItems = false;
    this.toolPrefetch.clear();
    this.eventChain = Promise.resolve();
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
      await this.setupPreviewFromStream();
      this.startPeriodicFrames();
    }

    this.callbacks.onLocalStream?.(this.localStream);
    this.callbacks.onVideoModeChange?.(this.videoMode);

    this.dc = this.pc.createDataChannel("oai-events");
    this.dc.addEventListener("message", (event) => {
      const raw = String(event.data);
      this.eventChain = this.eventChain
        .then(() => this.onDataMessage(raw))
        .catch(() => undefined);
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

  /** Turn camera on without ending the voice session (same conversation). */
  async enableVideo() {
    if (this.closed || !this.pc || !this.localStream) {
      throw new Error("Start voice first");
    }
    if (this.videoMode) return;

    const cam = await navigator.mediaDevices.getUserMedia({
      video: {
        facingMode: { ideal: "environment" },
        width: { ideal: 1280 },
        height: { ideal: 720 },
      },
    });
    for (const track of cam.getVideoTracks()) {
      this.localStream.addTrack(track);
    }
    this.videoMode = true;
    await this.setupPreviewFromStream();
    this.callbacks.onLocalStream?.(this.localStream);
    this.callbacks.onVideoModeChange?.(true);
    this.sendEvent({
      type: "conversation.item.create",
      item: {
        type: "message",
        role: "user",
        content: [
          {
            type: "input_text",
            text: "[Video mode enabled. Camera frames will arrive automatically while I speak. Use them for part ID and visual questions.]",
          },
        ],
      },
    });
    this.startPeriodicFrames();
    void this.captureAndSendFrame("video_enabled", true);
  }

  /** Turn camera off but keep the live voice session. */
  disableVideo() {
    if (!this.videoMode) return;
    this.stopPeriodicFrames();
    this.localStream?.getVideoTracks().forEach((t) => {
      t.stop();
      this.localStream?.removeTrack(t);
    });
    if (this.previewVideo) {
      this.previewVideo.srcObject = null;
      this.previewVideo = null;
    }
    this.videoMode = false;
    this.callbacks.onLocalStream?.(this.localStream);
    this.callbacks.onVideoModeChange?.(false);
    this.sendEvent({
      type: "conversation.item.create",
      item: {
        type: "message",
        role: "user",
        content: [
          {
            type: "input_text",
            text: "[Video mode off. Continue this same voice conversation without new camera frames.]",
          },
        ],
      },
    });
  }

  stop() {
    this.closed = true;
    this.stopPeriodicFrames();
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
    this.callbacks.onVideoModeChange?.(false);
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
    this.videoMode = false;
    this.setStatus("ended");
  }

  private async setupPreviewFromStream() {
    if (!this.localStream) return;
    if (!this.previewVideo) {
      this.previewVideo = document.createElement("video");
      this.previewVideo.playsInline = true;
      this.previewVideo.muted = true;
      this.previewVideo.autoplay = true;
    }
    this.previewVideo.srcObject = this.localStream;
    await this.previewVideo.play().catch(() => undefined);
  }

  private startPeriodicFrames() {
    this.stopPeriodicFrames();
    this.frameTimer = setInterval(() => {
      if (!this.videoMode || this.closed) return;
      void this.captureAndSendFrame("periodic");
    }, FRAME_PERIODIC_MS);
  }

  private stopPeriodicFrames() {
    if (this.frameTimer) {
      clearInterval(this.frameTimer);
      this.frameTimer = null;
    }
  }

  private setStatus(status: StormAiRealtimeStatus) {
    this.callbacks.onStatus?.(status);
  }

  private sendEvent(payload: Record<string, unknown>) {
    if (!this.dc || this.dc.readyState !== "open") return false;
    try {
      this.dc.send(JSON.stringify(payload));
      return true;
    } catch {
      return false;
    }
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
    // Never insert user/camera items while a function call is awaiting output —
    // that leaves the model stuck saying it is "still waiting" on the tool.
    if (this.suppressUserItems) return;
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
      if (this.videoMode) {
        void this.captureAndSendFrame("speech_started", true);
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

    if (type === "response.output_item.added") {
      const item = event.item as { type?: string; call_id?: string; name?: string } | undefined;
      if (item?.type === "function_call" && item.call_id && item.name) {
        this.pendingNames[item.call_id] = item.name;
        this.setStatus("tool");
        this.callbacks.onTool?.(item.name);
      }
      return;
    }

    if (type === "response.function_call_arguments.delta") {
      const callId = String(event.call_id || "");
      if (!callId) return;
      this.pendingArgs[callId] =
        (this.pendingArgs[callId] || "") + String(event.delta || "");
      const name = String(event.name || this.pendingNames[callId] || "");
      if (name) this.pendingNames[callId] = name;
      return;
    }

    if (type === "response.function_call_arguments.done") {
      const callId = String(event.call_id || "");
      const name = String(event.name || this.pendingNames[callId] || "");
      const argText = String(event.arguments || this.pendingArgs[callId] || "{}");
      delete this.pendingArgs[callId];
      if (name) this.pendingNames[callId] = name;
      // Prefetch only — do not send function_call_output until response.done.
      if (callId && name) {
        this.setStatus("tool");
        this.callbacks.onTool?.(name);
        this.beginToolPrefetch(callId, name, argText);
      }
      return;
    }

    if (type === "response.output_item.done") {
      const item = event.item as {
        type?: string;
        call_id?: string;
        name?: string;
        arguments?: string;
      } | undefined;
      if (item?.type === "function_call" && item.call_id && item.name) {
        this.pendingNames[item.call_id] = item.name;
        this.setStatus("tool");
        this.callbacks.onTool?.(item.name);
        this.beginToolPrefetch(
          item.call_id,
          item.name,
          String(item.arguments || this.pendingArgs[item.call_id] || "{}")
        );
      }
      return;
    }

    if (type === "response.done") {
      const response = event.response as {
        output?: Array<{
          type?: string;
          call_id?: string;
          name?: string;
          arguments?: string;
        }>;
        status?: string;
      } | undefined;
      const outputs = response?.output ?? [];
      const toolItems = outputs.filter(
        (item) => item.type === "function_call" && item.call_id && item.name
      );

      if (toolItems.length === 0) {
        this.setStatus("listening");
        return;
      }

      // Wait until this model turn is fully done, then deliver every tool output
      // and create a single follow-up response.
      for (const item of toolItems) {
        await this.deliverToolOutput(
          String(item.call_id),
          String(item.name),
          String(item.arguments || "{}")
        );
      }
      await this.finishToolTurn();
    }
  }

  private beginToolPrefetch(callId: string, name: string, argText: string) {
    if (!this.conversationId || this.toolPrefetch.has(callId)) return;
    this.suppressUserItems = true;
    this.toolPrefetch.set(callId, this.fetchToolResult(callId, name, argText));
  }

  private async fetchToolResult(callId: string, name: string, argText: string): Promise<unknown> {
    let args: unknown = {};
    try {
      args = JSON.parse(argText || "{}");
    } catch {
      args = {};
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TOOL_TIMEOUT_MS);
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
        signal: controller.signal,
      });
      let result: unknown = await res.json().catch(() => ({
        ok: false,
        error: "Invalid tool response",
      }));
      if (!res.ok && typeof result === "object" && result && !("error" in result)) {
        result = { ok: false, error: `Tool failed (${res.status})` };
      }
      return result;
    } catch (err) {
      const timedOut = err instanceof Error && err.name === "AbortError";
      return {
        ok: false,
        error: timedOut
          ? "Tool timed out — tell the tech briefly and ask them to continue."
          : "Tool request failed",
      };
    } finally {
      clearTimeout(timer);
    }
  }

  private async deliverToolOutput(callId: string, name: string, argText: string) {
    if (!this.conversationId || !callId || !name) return;
    if (this.handledCallIds.has(callId)) return;
    this.handledCallIds.add(callId);

    this.setStatus("tool");
    this.callbacks.onTool?.(name);

    if (!this.toolPrefetch.has(callId)) {
      this.beginToolPrefetch(callId, name, argText);
    }
    const result =
      (await this.toolPrefetch.get(callId)) ??
      ({ ok: false, error: "Tool request failed" } as const);
    this.toolPrefetch.delete(callId);

    this.sendEvent({
      type: "session.update",
      session: {
        type: "realtime",
        audio: {
          input: {
            turn_detection: {
              type: "server_vad",
              threshold: 0.78,
              prefix_padding_ms: 400,
              silence_duration_ms: 900,
              interrupt_response: false,
              create_response: true,
            },
          },
        },
      },
    });

    const sentOutput = this.sendEvent({
      type: "conversation.item.create",
      item: {
        type: "function_call_output",
        call_id: callId,
        output: JSON.stringify(result),
      },
    });
    if (!sentOutput) {
      this.callbacks.onError?.(
        "Lost connection while looking something up — tap mic to reconnect."
      );
      this.setStatus("error");
    }
  }

  private async finishToolTurn() {
    const sentResponse = this.sendEvent({
      type: "response.create",
      response: {
        instructions:
          "A tool result was just added. Speak the answer to the technician now in one or two short sentences using only that result. Do not say you are still waiting. Then stop and listen.",
      },
    });

    if (!sentResponse) {
      this.callbacks.onError?.(
        "Lost connection while looking something up — tap mic to reconnect."
      );
      this.setStatus("error");
      this.suppressUserItems = false;
      return;
    }

    window.setTimeout(() => {
      if (this.closed) return;
      this.suppressUserItems = false;
      this.sendEvent({
        type: "session.update",
        session: {
          type: "realtime",
          audio: {
            input: {
              turn_detection: {
                type: "server_vad",
                threshold: 0.78,
                prefix_padding_ms: 400,
                silence_duration_ms: 900,
                interrupt_response: true,
                create_response: true,
              },
            },
          },
        },
      });
    }, 2500);

    this.setStatus("speaking");
  }
}
