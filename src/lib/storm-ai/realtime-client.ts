import { isRecoverableRealtimeError } from "./realtime-errors";
import {
  STORM_AI_ECHO_GUARD_MS,
  STORM_AI_INPUT_NOISE_REDUCTION,
  isPartsSearchIntentSpeech,
  isShortAckTranscript,
  stormAiServerVad,
  VIDEO_SKIP_FRAME_RE,
} from "./realtime-vad";
import { isRealtimeToolResultOk } from "./realtime-tool-payload";
import { buildTechAssistSpeakInstructions } from "./tech-assist-reply";

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
  summary?: string | null;
  manualUrl: string | null;
  manualKind: "pdf" | "link" | null;
  photos: Array<{ id?: string; url: string; fileName: string }>;
  confirmedPhotoId?: string | null;
  matchConfidence?: number | null;
  visuallyConfirmed?: boolean;
};

type SessionResponse = {
  conversationId: string;
  clientSecret: string;
  model?: string;
  error?: string;
  activeTechAssist?: {
    active: true;
    sessionId: string;
    issueId: string;
    issueName: string;
    step: {
      type: string;
      title?: string;
      test?: string;
      instructions?: string;
      tips?: string | null;
      options?: Array<{ id: string; label: string }> | null;
      choices?: string[] | null;
      done?: boolean;
    };
    note?: string;
  } | null;
};

const FRAME_MIN_INTERVAL_MS = 1500;
/** Keep stills small — large JPEG data URLs silently break the WebRTC data channel. */
const FRAME_MAX_EDGE = 768;
const FRAME_JPEG_QUALITY = 0.55;
/** Soft cap on data-URL length (chars). Full event JSON must stay under typical DC limits. */
const FRAME_MAX_DATA_URL_CHARS = 90_000;
const FRAME_ABSOLUTE_MAX_DATA_URL_CHARS = 180_000;
const TOOL_TIMEOUT_MS = 25_000;
const SEARCH_FALLBACK_MS = 2500;
const VIDEO_TURN_FLUSH_MS = 1800;
/** If response.create never yields response.created after a video turn, unlock listening. */
const VIDEO_RESPONSE_WATCHDOG_MS = 6_000;

/** Shrink encode settings until the JPEG data URL fits a WebRTC-safe budget. */
export function nextFrameEncodeAttempt(
  maxEdge: number,
  quality: number,
  dataUrlChars: number,
  limit = FRAME_MAX_DATA_URL_CHARS
): { maxEdge: number; quality: number } | "ok" | "give_up" {
  if (dataUrlChars <= limit) return "ok";
  if (maxEdge <= 320 && quality <= 0.35) return "give_up";
  return {
    maxEdge: Math.max(320, Math.round(maxEdge * 0.72)),
    quality: Math.max(0.35, Math.round((quality - 0.1) * 100) / 100),
  };
}

function stripChatCard(result: unknown): unknown {
  if (!result || typeof result !== "object") return result;
  const { chatCard: _omit, ...rest } = result as Record<string, unknown>;
  return rest;
}

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
  /** True after we sent response.create until response.created (or watchdog unlock). */
  private awaitingResponseCreated = false;
  private videoResponseWatchdog: ReturnType<typeof setTimeout> | null = null;
  private videoResponseEpoch = 0;
  /** Prevent infinite watchdog retries when the data channel is wedged. */
  private videoResponseRetryUsed = false;
  /** Block camera frames only while a real function_call awaits output. */
  private awaitingFunctionOutput = false;
  private eventChain: Promise<void> = Promise.resolve();
  private toolPrefetch = new Map<string, Promise<unknown>>();
  /** True after we sent function_call_output and still need a spoken follow-up. */
  private needsSpokenFollowUp = false;
  private inFlightTools = 0;
  private modelResponseActive = false;
  /** When false, server VAD must not auto-start a response (avoids overlap cutoffs). */
  private autoCreateResponse = true;
  /** User finished a turn while the model was still speaking — reply after response.done. */
  private pendingUserTurnAfterResponse = false;
  /** User started speaking after the model began this turn (not a delayed prior utterance). */
  private speechStartedDuringResponse = false;
  /** True when a user transcript arrived for speech that started during the model turn. */
  private heardTranscriptDuringResponse = false;
  private followUpTimer: ReturnType<typeof setTimeout> | null = null;
  private followUpWaitStartedAt = 0;
  private lastWaitActivityAt = 0;
  private lastUserTranscript = "";
  private searchFallbackTimer: ReturnType<typeof setTimeout> | null = null;
  private searchFallbackUsed = false;
  /** After tool output we expect audible speech; empty turns get one forced retry. */
  private expectingSpokenAnswer = false;
  private heardAssistantTranscriptThisResponse = false;
  private emptySpeakRetryUsed = false;
  private pendingSpeakInstructions: string | null = null;
  /** Mic/create_response stay gated after AI speech so speaker echo cannot start a turn. */
  private echoGuardUntil = 0;
  private echoGuardTimer: ReturnType<typeof setTimeout> | null = null;
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
    this.awaitingResponseCreated = false;
    this.clearVideoResponseWatchdog();
    this.videoResponseRetryUsed = false;
    this.autoCreateResponse = !opts.videoMode;
    this.pendingUserTurnAfterResponse = false;
    this.speechStartedDuringResponse = false;
    this.heardTranscriptDuringResponse = false;
    this.clearFollowUpTimer();
    this.clearEchoGuard();
    this.toolPrefetch.clear();
    this.searchFallbackUsed = false;
    this.clearSearchFallback();
    this.expectingSpokenAnswer = false;
    this.heardAssistantTranscriptThisResponse = false;
    this.emptySpeakRetryUsed = false;
    this.pendingSpeakInstructions = null;
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
    const activeTechAssist = session.activeTechAssist ?? null;
    this.dc.addEventListener("open", () => {
      this.seedActiveTechAssist(activeTechAssist);
    });
    this.dc.addEventListener("close", () => {
      if (this.closed) return;
      this.activity("Realtime data channel closed", "error");
      this.unlockStuckModelTurn();
      this.callbacks.onError?.(
        "Voice connection dropped — tap mic to reconnect."
      );
      this.setStatus("error");
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
    // Failed camera turns can leave us waiting forever for response.created.
    // Only unlock that stuck case — do not cancel a response that already started.
    const stuckWaitingForModel = this.awaitingResponseCreated;
    this.videoMode = false;
    this.setAutoCreateResponse(true);
    this.localStream?.getVideoTracks().forEach((t) => {
      t.stop();
      this.localStream?.removeTrack(t);
    });
    if (this.previewVideo) {
      this.previewVideo.srcObject = null;
      this.previewVideo = null;
    }
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
    if (stuckWaitingForModel) {
      this.activity("Video off — unlocking stuck turn so voice can continue", "wait");
      this.unlockStuckModelTurn();
      // Answer the question that stalled while the camera was on.
      const sent = this.sendEvent({ type: "response.create" });
      if (sent) this.markResponseCreateSent();
    }
  }

  stop() {
    this.closed = true;
    this.clearSearchFallback();
    this.clearFollowUpTimer();
    this.clearEchoGuard();
    this.clearVideoResponseWatchdog();
    this.needsSpokenFollowUp = false;
    this.followUpWaitStartedAt = 0;
    this.inFlightTools = 0;
    this.modelResponseActive = false;
    this.awaitingResponseCreated = false;
    this.pendingUserTurnAfterResponse = false;
    this.speechStartedDuringResponse = false;
    this.heardTranscriptDuringResponse = false;
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
    this.autoCreateResponse = enabled;
    this.sendEvent({
      type: "session.update",
      session: {
        type: "realtime",
        audio: {
          input: {
            noise_reduction: STORM_AI_INPUT_NOISE_REDUCTION,
            turn_detection: stormAiServerVad({
              createResponse: enabled,
              interruptResponse: false,
            }),
          },
        },
      },
    });
  }

  private setMicEnabled(enabled: boolean) {
    this.localStream?.getAudioTracks().forEach((track) => {
      track.enabled = enabled;
    });
  }

  private clearEchoGuard() {
    if (this.echoGuardTimer) {
      clearTimeout(this.echoGuardTimer);
      this.echoGuardTimer = null;
    }
    this.echoGuardUntil = 0;
  }

  private inEchoGuard() {
    return Date.now() < this.echoGuardUntil;
  }

  /**
   * After AI audio ends, keep mic + auto-response off briefly so speaker echo
   * (often transcribed as "thank you" / "bye-bye") cannot start a new turn.
   */
  private armEchoGuard(ms = STORM_AI_ECHO_GUARD_MS) {
    this.clearEchoGuard();
    this.echoGuardUntil = Date.now() + ms;
    this.setMicEnabled(false);
    if (!this.videoMode) {
      this.setAutoCreateResponse(false);
    }
    this.echoGuardTimer = setTimeout(() => {
      this.echoGuardTimer = null;
      this.echoGuardUntil = 0;
      if (this.closed || this.modelResponseActive) return;
      this.setMicEnabled(true);
      if (!this.videoMode && !this.autoCreateResponse) {
        this.setAutoCreateResponse(true);
      }
      this.activity("Echo guard ended — listening", "ok");
      this.setStatus("listening");
    }, ms);
  }

  /** While the model is speaking, mute the mic and block VAD auto-responses. */
  private setSpeakingGate(speaking: boolean) {
    if (this.closed) return;
    if (speaking) {
      this.clearEchoGuard();
      this.setMicEnabled(false);
      if (!this.videoMode && this.autoCreateResponse) {
        this.setAutoCreateResponse(false);
      }
      return;
    }
    // End of model audio — hold the gate briefly for speaker echo.
    this.armEchoGuard();
  }

  private cancelLikelyEchoTurn(reason: string) {
    this.activity(reason, "wait");
    this.pendingUserTurnAfterResponse = false;
    this.heardTranscriptDuringResponse = false;
    this.speechStartedDuringResponse = false;
    this.sendEvent({ type: "response.cancel" });
    this.sendEvent({ type: "input_audio_buffer.clear" });
    this.modelResponseActive = false;
    this.awaitingResponseCreated = false;
    this.clearVideoResponseWatchdog();
    if (!this.inEchoGuard()) {
      this.armEchoGuard(Math.min(900, STORM_AI_ECHO_GUARD_MS));
    }
  }

  private requestPendingUserFollowUp() {
    if (this.closed || this.videoMode) return;
    if (this.modelResponseActive || this.awaitingFunctionOutput) return;
    if (this.needsSpokenFollowUp || this.inFlightTools > 0) return;
    if (this.inEchoGuard()) {
      this.activity("Skipping follow-up during echo guard", "wait");
      return;
    }
    if (!this.heardTranscriptDuringResponse) {
      this.activity("No new user transcript during AI turn — not following up", "wait");
      return;
    }
    this.heardTranscriptDuringResponse = false;
    // Echo/"thanks" while the AI is talking should not start a new spoken turn.
    if (isShortAckTranscript(this.lastUserTranscript)) {
      this.activity("Ignoring short ack from during AI turn", "wait");
      return;
    }
    this.activity("User spoke during AI turn — starting follow-up response");
    const sent = this.sendEvent({ type: "response.create" });
    if (sent) {
      this.modelResponseActive = true;
      this.setSpeakingGate(true);
      this.setStatus("speaking");
    }
  }

  private clearVideoTurn() {
    this.videoTurnPending = false;
    if (this.videoTurnTimer) {
      clearTimeout(this.videoTurnTimer);
      this.videoTurnTimer = null;
    }
  }

  private clearVideoResponseWatchdog() {
    if (this.videoResponseWatchdog) {
      clearTimeout(this.videoResponseWatchdog);
      this.videoResponseWatchdog = null;
    }
  }

  /** Clear a turn that never received response.created so listening can resume. */
  private unlockStuckModelTurn() {
    this.clearVideoResponseWatchdog();
    this.awaitingResponseCreated = false;
    this.modelResponseActive = false;
    this.pendingUserTurnAfterResponse = false;
    this.speechStartedDuringResponse = false;
    this.heardTranscriptDuringResponse = false;
    this.clearVideoTurn();
    if (!this.closed) {
      this.setStatus("listening");
    }
  }

  private armVideoResponseWatchdog() {
    this.clearVideoResponseWatchdog();
    const epoch = ++this.videoResponseEpoch;
    this.videoResponseWatchdog = setTimeout(() => {
      this.videoResponseWatchdog = null;
      if (this.closed || epoch !== this.videoResponseEpoch) return;
      if (!this.awaitingResponseCreated) return;
      this.activity(
        "No model response after camera turn — unlocking so you can keep talking",
        "wait"
      );
      this.unlockStuckModelTurn();
      // One best-effort retry without another frame (a large frame may have wedged DC).
      if (!this.videoResponseRetryUsed && this.dc?.readyState === "open") {
        this.videoResponseRetryUsed = true;
        this.activity("Retrying spoken response without a new camera frame", "wait");
        const sent = this.sendEvent({ type: "response.create" });
        if (sent) {
          this.markResponseCreateSent();
        }
      }
    }, VIDEO_RESPONSE_WATCHDOG_MS);
  }

  private markResponseCreateSent() {
    this.awaitingResponseCreated = true;
    this.modelResponseActive = true;
    this.setStatus("speaking");
    this.armVideoResponseWatchdog();
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
    this.videoResponseRetryUsed = false;
    if (withFrame) {
      this.activity("Capturing camera frame for your question");
      const frameOk = await this.captureAndSendFrame("user_question", true);
      if (!frameOk) {
        this.activity("Continuing without camera frame", "wait");
      }
    }
    const sent = this.sendEvent({ type: "response.create" });
    if (sent) {
      this.markResponseCreateSent();
    } else {
      this.activity("Could not start response after video turn", "error");
      this.unlockStuckModelTurn();
    }
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
      const raw = JSON.stringify(payload);
      // Hard guard: oversized data-channel messages wedge OpenAI WebRTC sessions.
      if (raw.length > FRAME_ABSOLUTE_MAX_DATA_URL_CHARS + 2_000) {
        console.error("[storm-ai realtime] event too large for data channel", raw.length);
        this.activity(
          `Skipped oversized realtime event (${Math.round(raw.length / 1000)}KB)`,
          "wait"
        );
        return false;
      }
      this.dc.send(raw);
      return true;
    } catch (err) {
      console.error("[storm-ai realtime] send failed", err);
      return false;
    }
  }

  /** After reconnect, remind the model of the in-progress diagnostic so it does not freestyle. */
  private seedActiveTechAssist(
    active: SessionResponse["activeTechAssist"] | null | undefined
  ) {
    if (!active?.active || !active.sessionId) return;
    const step = active.step;
    const options =
      Array.isArray(step.options) && step.options.length
        ? step.options.map((o) => o.label).join(" | ")
        : Array.isArray(step.choices) && step.choices.length
          ? step.choices.join(" | ")
          : null;
    const lines = [
      "[System: voice reconnected with an active technician assist session. Resume this step only — do not invent other tests.]",
      `sessionId: ${active.sessionId}`,
      `issue: ${active.issueName}`,
      `step: ${step.title ?? ""} (${step.type})`,
    ];
    if (step.type === "DIAGNOSTIC") {
      lines.push(`test: ${step.test || step.instructions || ""}`);
      if (step.tips) lines.push(`tips: ${step.tips}`);
      if (options) lines.push(`options: ${options}`);
    } else if (step.instructions) {
      lines.push(`instructions: ${step.instructions}`);
    }
    lines.push(
      "When the technician answers, call continue_tech_assist with this sessionId. Do not restart at step 1."
    );
    const sent = this.sendEvent({
      type: "conversation.item.create",
      item: {
        type: "message",
        role: "user",
        content: [{ type: "input_text", text: lines.join("\n") }],
      },
    });
    if (sent) {
      this.activity(`Resumed tech assist: ${active.issueName}`, "ok");
    }
  }

  private grabJpegDataUrl(): string | null {
    const video = this.previewVideo;
    if (!video || video.videoWidth < 2 || video.videoHeight < 2) return null;

    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;

    let maxEdge = FRAME_MAX_EDGE;
    let quality = FRAME_JPEG_QUALITY;
    let dataUrl = "";

    for (let attempt = 0; attempt < 8; attempt++) {
      const scale = Math.min(1, maxEdge / Math.max(video.videoWidth, video.videoHeight));
      const width = Math.max(1, Math.round(video.videoWidth * scale));
      const height = Math.max(1, Math.round(video.videoHeight * scale));
      canvas.width = width;
      canvas.height = height;
      ctx.drawImage(video, 0, 0, width, height);
      dataUrl = canvas.toDataURL("image/jpeg", quality);
      const next = nextFrameEncodeAttempt(maxEdge, quality, dataUrl.length);
      if (next === "ok") return dataUrl;
      if (next === "give_up") break;
      maxEdge = next.maxEdge;
      quality = next.quality;
    }

    if (dataUrl && dataUrl.length <= FRAME_ABSOLUTE_MAX_DATA_URL_CHARS) {
      this.activity(
        `Camera frame still large (${Math.round(dataUrl.length / 1000)}KB) — sending compressed still`,
        "wait"
      );
      return dataUrl;
    }
    this.activity("Camera frame too large to send over voice channel", "wait");
    return null;
  }

  /** @returns true when an image item was sent on the realtime data channel. */
  private async captureAndSendFrame(reason: string, force = false): Promise<boolean> {
    if (this.awaitingFunctionOutput) return false;
    if (!this.videoMode || this.closed || !this.conversationId) return false;
    const now = Date.now();
    if (!force && now - this.lastFrameAt < FRAME_MIN_INTERVAL_MS) return false;
    if (this.frameInFlight) return false;

    const dataUrl = this.grabJpegDataUrl();
    if (!dataUrl) return false;

    this.frameInFlight = true;
    this.lastFrameAt = now;
    try {
      const sent = this.sendEvent({
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
      if (!sent) {
        this.activity("Could not send camera frame over data channel", "wait");
        return false;
      }
      this.activity(
        `Camera frame sent (${Math.round(dataUrl.length / 1000)}KB)`,
        "ok"
      );

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
      return true;
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
      const err = event.error as { message?: string; code?: string; param?: string } | undefined;
      const message = err?.message || "Realtime error";
      const recoverable =
        isRecoverableRealtimeError(message, err?.code) ||
        /session\.type/i.test(String(err?.param || ""));
      console.error("[storm-ai realtime] server error", err);
      this.activity(`Server error: ${message}`, recoverable ? "wait" : "error");
      if (!recoverable) {
        this.callbacks.onError?.(message);
        this.setStatus("error");
      }
      return;
    }

    if (type === "input_audio_buffer.speech_started") {
      // Keep "speaking" in the UI while the model is still playing — false VAD
      // from echo/noise used to flip status and feel like the answer cut out.
      if (this.modelResponseActive) {
        this.speechStartedDuringResponse = true;
        this.activity("Heard speech during AI turn — keeping playback", "wait");
        return;
      }
      if (this.inEchoGuard()) {
        this.activity("Heard speech during echo guard — ignoring", "wait");
        return;
      }
      this.setStatus("listening");
      this.activity("Heard speech — listening");
      return;
    }

    if (type === "input_audio_buffer.speech_stopped") {
      if (this.videoMode) {
        this.beginVideoTurn();
        return;
      }
      if (this.inEchoGuard() && !this.modelResponseActive) {
        this.activity("Speech ended during echo guard — not queueing a turn", "wait");
        this.sendEvent({ type: "input_audio_buffer.clear" });
        return;
      }
      // create_response is off while the model speaks; queue a follow-up instead
      // of letting server VAD race a second response.create (audio cutoff).
      // Only queue when the model is actually speaking — echo-guard periods also
      // set autoCreateResponse false and must not leave a sticky pending turn.
      if (this.modelResponseActive) {
        this.pendingUserTurnAfterResponse = true;
      }
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
        this.awaitingResponseCreated = false;
        this.clearVideoResponseWatchdog();
        this.videoResponseRetryUsed = false;
        this.speechStartedDuringResponse = false;
        this.heardTranscriptDuringResponse = false;
        this.heardAssistantTranscriptThisResponse = false;
        this.setSpeakingGate(true);
        this.activity("Model started a response");
      }
      this.setStatus("speaking");
      return;
    }

    if (type === "response.cancelled" || type === "output_audio_buffer.stopped") {
      if (type === "response.cancelled") {
        this.modelResponseActive = false;
        this.awaitingResponseCreated = false;
        this.clearVideoResponseWatchdog();
        this.setSpeakingGate(false);
        this.activity("Model response cancelled", "wait");
        if (this.pendingUserTurnAfterResponse) {
          this.pendingUserTurnAfterResponse = false;
          window.setTimeout(() => this.requestPendingUserFollowUp(), 400);
        }
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
        // Speaker echo after AI audio often lands as "thank you" / "bye-bye".
        if (
          isShortAckTranscript(transcript) &&
          (this.inEchoGuard() || this.modelResponseActive)
        ) {
          this.cancelLikelyEchoTurn(
            `Ignoring likely echo transcript: "${transcript.slice(0, 40)}"`
          );
          return;
        }
        this.lastUserTranscript = transcript;
        // Ignore delayed transcripts of the turn that triggered this response.
        if (this.modelResponseActive && this.speechStartedDuringResponse) {
          this.heardTranscriptDuringResponse = true;
        }
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
        this.heardAssistantTranscriptThisResponse = true;
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
      this.awaitingResponseCreated = false;
      this.clearVideoResponseWatchdog();
      this.setSpeakingGate(false);
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

      // Tool follow-up produced silence (common on RESOLUTION steps) — force one retry.
      if (
        this.expectingSpokenAnswer &&
        !this.heardAssistantTranscriptThisResponse &&
        !this.needsSpokenFollowUp &&
        this.inFlightTools === 0
      ) {
        this.expectingSpokenAnswer = false;
        if (!this.emptySpeakRetryUsed) {
          this.emptySpeakRetryUsed = true;
          this.activity(
            "Empty spoken answer after tool — retrying with explicit instructions",
            "wait"
          );
          this.requestSpokenToolFollowUp(true);
          return;
        }
        this.activity("Empty spoken answer after retry — staying silent", "error");
      } else if (this.heardAssistantTranscriptThisResponse) {
        this.expectingSpokenAnswer = false;
        this.emptySpeakRetryUsed = false;
      }

      // Safe to ask for spoken follow-up only after outputs are sent.
      this.scheduleSpokenFollowUp(80);
      if (
        !this.awaitingFunctionOutput &&
        !this.needsSpokenFollowUp &&
        this.inFlightTools === 0 &&
        !this.expectingSpokenAnswer
      ) {
        this.setStatus("listening");
        if (this.pendingUserTurnAfterResponse) {
          this.pendingUserTurnAfterResponse = false;
          // Brief delay so a late Whisper transcript for the barge-in can land first.
          window.setTimeout(() => this.requestPendingUserFollowUp(), 400);
        }
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

    const ok = isRealtimeToolResultOk(result);
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

    const cardPublished = this.publishPartsCard(result);
    if (cardPublished) {
      this.activity("Parts card sent to chat", "ok");
    } else if (
      typeof result === "object" &&
      result &&
      "chatCard" in result &&
      (result as { chatCard?: unknown }).chatCard
    ) {
      this.activity("Parts card present but could not render in chat", "wait");
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
      this.emptySpeakRetryUsed = false;
      this.pendingSpeakInstructions =
        buildTechAssistSpeakInstructions(result) ??
        "You must speak now. Tell the technician what the tool result means in one or two short sentences, then stop and listen. Do not stay silent.";
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
          this.setSpeakingGate(false);
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

  private publishPartsCard(result: unknown): boolean {
    if (!result || typeof result !== "object") return false;
    const row = result as Record<string, unknown>;
    const card = row.chatCard;
    if (!card || typeof card !== "object") return false;
    const parsed = card as StormAiPartsCardPayload;
    if (parsed.kind !== "parts_card" || !parsed.name) return false;
    // Ensure photos is always an array so the chat card never crashes on render.
    const safeCard: StormAiPartsCardPayload = {
      ...parsed,
      photos: Array.isArray(parsed.photos) ? parsed.photos : [],
    };
    this.callbacks.onPartsCard?.(safeCard);
    return true;
  }

  private requestSpokenToolFollowUp(forceRetry = false) {
    const instructions =
      this.pendingSpeakInstructions ||
      (forceRetry
        ? "You must speak now. Summarize the latest tool result for the technician in one or two short sentences. Do not stay silent."
        : null);
    this.activity(
      forceRetry
        ? "Retrying spoken tool answer with explicit instructions…"
        : "Asking model to speak the tool answer…"
    );
    const sent = this.sendEvent({
      type: "response.create",
      ...(instructions
        ? {
            response: {
              instructions,
            },
          }
        : {}),
    });
    if (!sent) {
      this.activity("Could not request spoken answer — connection lost", "error");
      this.callbacks.onError?.(
        "Lost connection while looking something up — tap mic to reconnect."
      );
      this.setStatus("error");
      return;
    }
    this.expectingSpokenAnswer = true;
    this.heardAssistantTranscriptThisResponse = false;
    this.modelResponseActive = true;
    this.setSpeakingGate(true);
    this.setStatus("speaking");
  }

  private async fetchToolResult(callId: string, name: string, argText: string): Promise<unknown> {
    let args: unknown = {};
    try {
      args = JSON.parse(argText || "{}");
    } catch {
      args = {};
    }

    const timeoutMs = name === "search_parts_info" ? 55_000 : TOOL_TIMEOUT_MS;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
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
    if (!isPartsSearchIntentSpeech(assistantTranscript)) return;
    if (this.searchFallbackUsed || this.awaitingFunctionOutput) return;
    if (this.needsSpokenFollowUp || this.inFlightTools > 0) return;

    this.activity(
      "AI said it would search parts — starting fallback timer (2.5s)",
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
    this.clearFollowUpTimer();
    // We are about to create the spoken answer ourselves — do not leave a
    // sticky needsSpokenFollowUp that would trigger a second response.done speak.
    this.needsSpokenFollowUp = false;
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
    this.sendEvent({
      type: "response.create",
      response: {
        instructions: spoken
          ? `Speak this to the technician now, then stop and listen: ${spoken}`
          : "Tell the technician the parts library search finished and summarize the tool JSON that was just added. Do not say you are still waiting.",
      },
    });
    this.modelResponseActive = true;
    this.setSpeakingGate(true);
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
    const visual =
      data.visualMatch && typeof data.visualMatch === "object"
        ? (data.visualMatch as Record<string, unknown>)
        : null;
    if (visual?.ran === true && visual.confirmed !== true) {
      return "I compared that photo to the parts library and could not confirm a match. Try a closer, well-lit shot of the part.";
    }
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
    const confirmed = visual?.confirmed === true ? "The library photo matches what you are showing. " : "";
    return `${confirmed}From the parts library, this looks like ${name}${manufacturer}${partNumber}.`;
  }
}
