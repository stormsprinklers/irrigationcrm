export type StormAiRealtimeStatus =
  | "idle"
  | "connecting"
  | "listening"
  | "speaking"
  | "tool"
  | "error"
  | "ended";

export type StormAiRealtimeActivity = {
  at: number;
  level: "info" | "wait" | "ok" | "error";
  message: string;
};

export type StormAiRealtimeCallbacks = {
  onStatus?: (status: StormAiRealtimeStatus) => void;
  onTranscript?: (role: "user" | "assistant", text: string) => void;
  onTool?: (name: string) => void;
  onError?: (message: string) => void;
  onFrameCaptured?: (info: { savedToJob: boolean; visitId: string | null }) => void;
  /** Local camera stream for full-FPS preview (video track is NOT sent to OpenAI). */
  onLocalStream?: (stream: MediaStream | null) => void;
  onVideoModeChange?: (enabled: boolean) => void;
  /** Parts lookup result to render in the chat transcript. */
  onPartsCard?: (card: StormAiPartsCardPayload) => void;
  /** Live step log so the UI can show where a silent session is stuck. */
  onActivity?: (entry: StormAiRealtimeActivity) => void;
};

export type StormAiPartsCardPayload = {
  kind: "parts_card";
  partId: string;
  name: string;
  manufacturer: string | null;
  partNumber: string | null;
  section: string | null;
  visualDescription: string | null;
  technicalDescription: string | null;
  manualUrl: string | null;
  manualKind: "pdf" | "link" | null;
  photos: Array<{ id?: string; url: string; fileName: string }>;
};

type SessionResponse = {
  conversationId: string;
  clientSecret: string;
  model?: string;
  error?: string;
};

const FRAME_MIN_INTERVAL_MS = 1500;
const FRAME_MAX_EDGE = 1280;
const FRAME_JPEG_QUALITY = 0.82;
const TOOL_TIMEOUT_MS = 25_000;
const SEARCH_FALLBACK_MS = 2500;
const VIDEO_TURN_FLUSH_MS = 1800;

function stripChatCard(result: unknown): unknown {
  if (!result || typeof result !== "object") return result;
  const { chatCard: _omit, ...rest } = result as Record<string, unknown>;
  return rest;
}

const VIDEO_SKIP_FRAME_RE =
  /^(ok|okay|yes|yeah|yep|no|nope|thanks|thank you|got it|alright|all right|continue|next|done|copy|uh-huh|mm-hmm)[\s.!?]*$/i;

const VISUAL_QUESTION_RE =
  /\b(what|which|where|how|look|see|show|showing|this|that|here|valve|solenoid|controller|part|identify|tell me|can you|could you|manual)\b/i;

function shouldSendCameraFrame(transcript: string): boolean {
  const text = transcript.trim();
  if (text.length < 3) return false;
  if (VIDEO_SKIP_FRAME_RE.test(text)) return false;
  if (/\?/.test(text)) return true;
  if (VISUAL_QUESTION_RE.test(text)) return true;
  return text.split(/\s+/).length >= 3;
}

const SEARCHING_SPEECH_RE =
  /\b(search|searching|look(ing)? up|check(ing)?|parts (list|library|info)|let me (find|check|look|search))\b/i;

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
  /** Video mode waits for the user question, then attaches one still before responding. */
  private videoTurnPending = false;
  private videoTurnTimer: ReturnType<typeof setTimeout> | null = null;
  /** Block camera frames only while a real function_call awaits output. */
  private awaitingFunctionOutput = false;
  private eventChain: Promise<void> = Promise.resolve();
  private toolPrefetch = new Map<string, Promise<unknown>>();
  /** True after we sent function_call_output and still need a spoken follow-up. */
  private needsSpokenFollowUp = false;
  private inFlightTools = 0;
  private modelResponseActive = false;
  private followUpTimer: ReturnType<typeof setTimeout> | null = null;
  private followUpWaitStartedAt = 0;
  private lastWaitActivityAt = 0;
  private lastUserTranscript = "";
  private searchFallbackTimer: ReturnType<typeof setTimeout> | null = null;
  private searchFallbackUsed = false;
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
    this.awaitingFunctionOutput = false;
    this.needsSpokenFollowUp = false;
    this.inFlightTools = 0;
    this.modelResponseActive = false;
    this.clearFollowUpTimer();
    this.toolPrefetch.clear();
    this.searchFallbackUsed = false;
    this.clearSearchFallback();
    this.eventChain = Promise.resolve();
    this.videoMode = Boolean(opts.videoMode);
    this.visitId =
      typeof opts.pageContext?.visitId === "string" ? opts.pageContext.visitId : null;
    this.setStatus("connecting");
    this.activity("Starting realtime session…");

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

    for (const track of this.localStream.getAudioTracks()) {
      this.pc.addTrack(track, this.localStream);
    }

    if (this.videoMode) {
      await this.setupPreviewFromStream();
    }

    this.callbacks.onLocalStream?.(this.localStream);
    this.callbacks.onVideoModeChange?.(this.videoMode);

    this.dc = this.pc.createDataChannel("oai-events");
    this.dc.addEventListener("message", (event) => {
      const raw = String(event.data);
      this.eventChain = this.eventChain
        .then(() => this.onDataMessage(raw))
        .catch((err) => {
          console.error("[storm-ai realtime] event handler error", err);
        });
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
    this.activity("Connected — listening", "ok");
    return { conversationId: this.conversationId };
  }

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
    // New MediaStream reference so React rebinds <video> when enabling mid-call.
    const previewStream = new MediaStream(this.localStream.getTracks());
    this.callbacks.onLocalStream?.(previewStream);
    this.callbacks.onVideoModeChange?.(true);
    this.sendEvent({
      type: "conversation.item.create",
      item: {
        type: "message",
        role: "user",
        content: [
          {
            type: "input_text",
            text: "[Video mode enabled. Send a camera frame only when I ask about what I am showing.]",
          },
        ],
      },
    });
    this.setAutoCreateResponse(false);
  }

  disableVideo() {
    if (!this.videoMode) return;
    this.clearVideoTurn();
    this.setAutoCreateResponse(true);
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
    this.clearSearchFallback();
    this.clearFollowUpTimer();
    this.needsSpokenFollowUp = false;
    this.followUpWaitStartedAt = 0;
    this.inFlightTools = 0;
    this.modelResponseActive = false;
    this.clearVideoTurn();
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

  private setAutoCreateResponse(enabled: boolean) {
    this.sendEvent({
      type: "session.update",
      session: {
        audio: {
          input: {
            turn_detection: {
              type: "server_vad",
              threshold: 0.78,
              prefix_padding_ms: 400,
              silence_duration_ms: 900,
              interrupt_response: true,
              create_response: enabled,
            },
          },
        },
      },
    });
  }

  private clearVideoTurn() {
    this.videoTurnPending = false;
    if (this.videoTurnTimer) {
      clearTimeout(this.videoTurnTimer);
      this.videoTurnTimer = null;
    }
  }

  private beginVideoTurn() {
    if (!this.videoMode || this.closed) return;
    this.videoTurnPending = true;
    if (this.videoTurnTimer) clearTimeout(this.videoTurnTimer);
    this.videoTurnTimer = setTimeout(() => {
      void this.finishVideoTurn(false);
    }, VIDEO_TURN_FLUSH_MS);
  }

  private async finishVideoTurn(withFrame: boolean) {
    if (!this.videoTurnPending || this.closed) return;
    this.clearVideoTurn();
    if (withFrame) {
      this.activity("Capturing camera frame for your question");
      await this.captureAndSendFrame("user_question", true);
    }
    this.sendEvent({ type: "response.create" });
  }

  private clearSearchFallback() {
    if (this.searchFallbackTimer) {
      clearTimeout(this.searchFallbackTimer);
      this.searchFallbackTimer = null;
    }
  }

  private setStatus(status: StormAiRealtimeStatus) {
    this.callbacks.onStatus?.(status);
  }

  private activity(
    message: string,
    level: StormAiRealtimeActivity["level"] = "info"
  ) {
    const entry: StormAiRealtimeActivity = { at: Date.now(), level, message };
    console.info(`[storm-ai realtime] ${message}`);
    this.callbacks.onActivity?.(entry);
  }

  private sendEvent(payload: Record<string, unknown>) {
    if (!this.dc || this.dc.readyState !== "open") return false;
    try {
      this.dc.send(JSON.stringify(payload));
      return true;
    } catch (err) {
      console.error("[storm-ai realtime] send failed", err);
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
    if (this.awaitingFunctionOutput) return;
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
              text: `[Camera frame for this question (${reason}). Look at this image to answer.]`,
            },
          ],
        },
      });

      const conversationId = this.conversationId;
      void fetch("/api/storm-ai/realtime/frame", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          conversationId,
          visitId: this.visitId || undefined,
          dataUrl,
          fileName: `storm-ai-frame-${Date.now()}.jpg`,
        }),
      })
        .then(async (res) => {
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
        })
        .catch(() => undefined);
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
      const err = event.error as { message?: string; code?: string } | undefined;
      console.error("[storm-ai realtime] server error", err);
      this.activity(`Server error: ${err?.message || "Realtime error"}`, "error");
      this.callbacks.onError?.(err?.message || "Realtime error");
      this.setStatus("error");
      return;
    }

    if (type === "input_audio_buffer.speech_started") {
      this.setStatus("listening");
      this.activity("Heard speech — listening");
      return;
    }

    if (type === "input_audio_buffer.speech_stopped") {
      if (this.videoMode) this.beginVideoTurn();
      return;
    }

    if (
      type === "response.created" ||
      type === "output_audio_buffer.started" ||
      type === "response.output_audio.delta" ||
      type === "response.audio.delta"
    ) {
      if (type === "response.created") {
        this.modelResponseActive = true;
        this.activity("Model started a response");
      }
      this.setStatus("speaking");
      return;
    }

    if (type === "response.cancelled" || type === "output_audio_buffer.stopped") {
      if (type === "response.cancelled") {
        this.modelResponseActive = false;
        this.activity("Model response cancelled", "wait");
      }
      if (!this.awaitingFunctionOutput && !this.needsSpokenFollowUp) {
        this.setStatus("listening");
      }
    }

    if (
      type === "conversation.item.input_audio_transcription.completed" ||
      type === "conversation.item.input_audio.transcription.completed"
    ) {
      const transcript = String(event.transcript || "").trim();
      if (transcript) {
        this.lastUserTranscript = transcript;
        this.callbacks.onTranscript?.("user", transcript);
        this.activity(`You: ${transcript.slice(0, 80)}${transcript.length > 80 ? "…" : ""}`);
      }
      if (this.videoMode && this.videoTurnPending && transcript) {
        void this.finishVideoTurn(shouldSendCameraFrame(transcript));
      }
      return;
    }

    if (
      type === "response.output_audio_transcript.done" ||
      type === "response.audio_transcript.done"
    ) {
      const transcript = String(event.transcript || "").trim();
      if (transcript) {
        this.callbacks.onTranscript?.("assistant", transcript);
        this.activity(
          `AI said: ${transcript.slice(0, 80)}${transcript.length > 80 ? "…" : ""}`
        );
        this.maybeScheduleSearchFallback(transcript);
      }
      return;
    }

    if (type === "response.output_item.added") {
      const item = event.item as { type?: string; call_id?: string; name?: string } | undefined;
      if (item?.type === "function_call" && item.call_id && item.name) {
        this.pendingNames[item.call_id] = item.name;
        this.setStatus("tool");
        this.callbacks.onTool?.(item.name);
        this.clearSearchFallback();
        this.activity(`Tool call started: ${item.name}`);
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
      if (callId && name) {
        this.clearSearchFallback();
        await this.completeFunctionCall(callId, name, argText);
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
        this.clearSearchFallback();
        await this.completeFunctionCall(
          item.call_id,
          item.name,
          String(item.arguments || this.pendingArgs[item.call_id] || "{}")
        );
      }
      return;
    }

    if (type === "response.done") {
      this.modelResponseActive = false;
      this.activity("Model turn finished");
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
      for (const item of outputs) {
        if (item.type === "function_call" && item.call_id && item.name) {
          this.clearSearchFallback();
          await this.completeFunctionCall(
            String(item.call_id),
            String(item.name),
            String(item.arguments || "{}")
          );
        }
      }

      // Safe to ask for spoken follow-up only after outputs are sent.
      this.scheduleSpokenFollowUp(80);
      if (
        !this.awaitingFunctionOutput &&
        !this.needsSpokenFollowUp &&
        this.inFlightTools === 0
      ) {
        this.setStatus("listening");
      }
    }
  }

  private async completeFunctionCall(callId: string, name: string, argText: string) {
    if (!this.conversationId || !callId || !name) return;
    if (this.handledCallIds.has(callId)) {
      this.activity(`Skipping duplicate tool call ${name}`, "wait");
      return;
    }
    this.handledCallIds.add(callId);

    this.awaitingFunctionOutput = true;
    this.inFlightTools += 1;
    this.setStatus("tool");
    this.callbacks.onTool?.(name);
    this.activity(`Running ${name}…`, "wait");

    if (!this.toolPrefetch.has(callId)) {
      this.toolPrefetch.set(callId, this.fetchToolResult(callId, name, argText));
    }
    const started = Date.now();
    const result =
      (await this.toolPrefetch.get(callId)) ??
      ({ ok: false, error: "Tool request failed" } as const);
    this.toolPrefetch.delete(callId);

    const ok =
      typeof result === "object" &&
      result &&
      "ok" in result &&
      (result as { ok?: boolean }).ok !== false;
    const errMsg =
      typeof result === "object" &&
      result &&
      "error" in result &&
      typeof (result as { error?: unknown }).error === "string"
        ? String((result as { error: string }).error)
        : null;
    this.activity(
      ok
        ? `${name} returned in ${Date.now() - started}ms`
        : `${name} failed${errMsg ? `: ${errMsg}` : ""} (${Date.now() - started}ms)`,
      ok ? "ok" : "error"
    );

    this.publishPartsCard(result);
    if (
      typeof result === "object" &&
      result &&
      "chatCard" in result &&
      (result as { chatCard?: unknown }).chatCard
    ) {
      this.activity("Parts card sent to chat", "ok");
    }

    this.activity(`Sending ${name} result to model…`);

    const forModel = stripChatCard(result);
    const sent = this.sendEvent({
      type: "conversation.item.create",
      item: {
        type: "function_call_output",
        call_id: callId,
        output: JSON.stringify(forModel),
      },
    });
    this.inFlightTools = Math.max(0, this.inFlightTools - 1);
    if (!sent) {
      this.activity("Lost connection while sending tool result", "error");
      this.callbacks.onError?.(
        "Lost connection while looking something up — tap mic to reconnect."
      );
      this.setStatus("error");
      this.awaitingFunctionOutput = false;
      return;
    }

    if (this.inFlightTools === 0) {
      this.awaitingFunctionOutput = false;
      this.needsSpokenFollowUp = true;
      this.activity("Tool result delivered — waiting to speak answer", "wait");
      // Wait until any in-flight model response ends, then speak.
      this.scheduleSpokenFollowUp(250);
    }
  }

  private clearFollowUpTimer() {
    if (this.followUpTimer) {
      clearTimeout(this.followUpTimer);
      this.followUpTimer = null;
    }
  }

  private scheduleSpokenFollowUp(delayMs: number) {
    this.clearFollowUpTimer();
    if (!this.followUpWaitStartedAt && this.needsSpokenFollowUp) {
      this.followUpWaitStartedAt = Date.now();
    }
    this.followUpTimer = setTimeout(() => {
      this.followUpTimer = null;
      if (this.closed) return;
      if (this.inFlightTools > 0 || this.awaitingFunctionOutput) {
        this.activityWait(`Waiting for ${this.inFlightTools || 1} tool(s) to finish…`);
        this.scheduleSpokenFollowUp(300);
        return;
      }
      if (this.modelResponseActive) {
        const waited = Date.now() - (this.followUpWaitStartedAt || Date.now());
        if (waited > 4000) {
          this.activity(
            "Model turn stuck open >4s — forcing spoken answer",
            "wait"
          );
          this.modelResponseActive = false;
        } else {
          this.activityWait("Waiting for current model turn to end…");
          this.scheduleSpokenFollowUp(300);
          return;
        }
      }
      if (!this.needsSpokenFollowUp) return;
      this.needsSpokenFollowUp = false;
      this.followUpWaitStartedAt = 0;
      this.requestSpokenToolFollowUp();
    }, delayMs);
  }

  /** Throttle repeated wait lines so the panel stays readable. */
  private activityWait(message: string) {
    const now = Date.now();
    if (now - this.lastWaitActivityAt < 1200) return;
    this.lastWaitActivityAt = now;
    this.activity(message, "wait");
  }

  private publishPartsCard(result: unknown) {
    if (!result || typeof result !== "object") return;
    const row = result as Record<string, unknown>;
    const card = row.chatCard;
    if (!card || typeof card !== "object") return;
    const parsed = card as StormAiPartsCardPayload;
    if (parsed.kind !== "parts_card" || !parsed.name) return;
    this.callbacks.onPartsCard?.(parsed);
  }

  private requestSpokenToolFollowUp() {
    this.activity("Asking model to speak the tool answer…");
    const sent = this.sendEvent({
      type: "response.create",
    });
    if (!sent) {
      this.activity("Could not request spoken answer — connection lost", "error");
      this.callbacks.onError?.(
        "Lost connection while looking something up — tap mic to reconnect."
      );
      this.setStatus("error");
      return;
    }
    this.modelResponseActive = true;
    this.setStatus("speaking");
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

  /**
   * If the model says it will search but never emits a function_call, run the
   * parts search ourselves and force a spoken answer.
   */
  private maybeScheduleSearchFallback(assistantTranscript: string) {
    if (!SEARCHING_SPEECH_RE.test(assistantTranscript)) return;
    if (this.searchFallbackUsed || this.awaitingFunctionOutput) return;
    if (this.needsSpokenFollowUp || this.inFlightTools > 0) return;

    this.activity(
      "AI said it would search — starting fallback timer (2.5s)",
      "wait"
    );
    this.clearSearchFallback();
    this.searchFallbackTimer = setTimeout(() => {
      void this.runSearchFallback();
    }, SEARCH_FALLBACK_MS);
  }

  private async runSearchFallback() {
    if (this.closed || this.searchFallbackUsed || this.awaitingFunctionOutput) return;
    if (this.needsSpokenFollowUp || this.inFlightTools > 0) return;
    if (!this.conversationId) return;

    this.searchFallbackUsed = true;
    this.setStatus("tool");
    this.callbacks.onTool?.("search_parts_info");
    this.activity("No tool call yet — running client parts search fallback", "wait");

    const query =
      this.lastUserTranscript.trim() ||
      "identify irrigation part from camera description valve solenoid controller";

    const result = await this.fetchToolResult(
      `fallback-${Date.now()}`,
      "search_parts_info",
      JSON.stringify({ query })
    );

    this.publishPartsCard(result);
    this.activity("Fallback search finished — forcing spoken answer", "ok");

    const spoken = this.formatPartsFallbackSpeech(result);
    this.sendEvent({
      type: "conversation.item.create",
      item: {
        type: "message",
        role: "user",
        content: [
          {
            type: "input_text",
            text: `[Parts library search already completed. Results JSON follows. Speak the answer to the technician now using only these results. Do not say you are still searching or waiting. Photos and manuals are already shown in chat.]\n${JSON.stringify(stripChatCard(result))}`,
          },
        ],
      },
    });
    this.needsSpokenFollowUp = true;
    this.sendEvent({
      type: "response.create",
      response: {
        instructions: spoken
          ? `Speak this to the technician now, then stop and listen: ${spoken}`
          : "Tell the technician the parts library search finished and summarize the tool JSON that was just added. Do not say you are still waiting.",
      },
    });
    this.modelResponseActive = true;
    this.setStatus("speaking");
    // Allow another fallback later in the session if needed.
    window.setTimeout(() => {
      this.searchFallbackUsed = false;
    }, 15_000);
  }

  private formatPartsFallbackSpeech(result: unknown): string | null {
    if (!result || typeof result !== "object") return null;
    const root = result as Record<string, unknown>;
    const data = (root.data as Record<string, unknown> | undefined) ?? root;
    const parts = data.parts;
    if (!Array.isArray(parts) || parts.length === 0) {
      return "I checked the parts library and did not find a match for what you are showing.";
    }
    const top = parts[0] as Record<string, unknown>;
    const name = typeof top.name === "string" ? top.name : "a matching part";
    const manufacturer =
      typeof top.manufacturer === "string" && top.manufacturer
        ? ` by ${top.manufacturer}`
        : "";
    const partNumber =
      typeof top.partNumber === "string" && top.partNumber
        ? `, part number ${top.partNumber}`
        : "";
    return `From the parts library, this looks like ${name}${manufacturer}${partNumber}.`;
  }
}
