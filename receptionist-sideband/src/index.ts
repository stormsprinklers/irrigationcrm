/**
 * Twilio Media Streams ↔ OpenAI Realtime bridge for AI receptionist.
 *
 * Env:
 *   PORT / SIDEBAND_PORT
 *   CRM_BASE_URL — e.g. https://crm.example.com
 *   OPENAI_API_KEY
 *   OPENAI_REALTIME_MODEL — optional, default gpt-realtime
 *
 * Audio: Twilio μ-law 8kHz ↔ OpenAI audio/pcmu (no resample) for clearer telephony audio.
 */

import "dotenv/config";
import http from "http";
import { randomUUID } from "crypto";
import { WebSocketServer, WebSocket } from "ws";

const PORT = Number(process.env.PORT || process.env.SIDEBAND_PORT || 8090);
const CRM_BASE_URL = (process.env.CRM_BASE_URL || "").replace(/\/$/, "");
const OPENAI_API_KEY = process.env.OPENAI_API_KEY || "";
const REALTIME_MODEL =
  process.env.OPENAI_REALTIME_MODEL || "gpt-realtime";

type SessionBootstrap = {
  receptionistCallId: string;
  voice: string;
  maxCallMinutes: number;
  instructions: string;
  tools: Array<{
    type: "function";
    name: string;
    description: string;
    parameters: Record<string, unknown>;
  }>;
  toolBearer: string;
  callSid: string;
  companyId: string;
};

function log(...args: unknown[]) {
  console.log(new Date().toISOString(), ...args);
}

function clampMaxMinutes(raw: unknown) {
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) return 12;
  // If someone accidentally stored seconds (e.g. 120–3600), convert to minutes.
  if (n > 45 && n <= 3600) return Math.min(45, Math.max(5, Math.round(n / 60)));
  return Math.min(45, Math.max(5, Math.round(n)));
}

async function bootstrapSession(token: string): Promise<SessionBootstrap> {
  if (!CRM_BASE_URL) throw new Error("CRM_BASE_URL is required");
  const res = await fetch(`${CRM_BASE_URL}/api/ai/receptionist/session`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ token }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "Session bootstrap failed");
  return data as SessionBootstrap;
}

async function callTool(
  bearer: string,
  tool: string,
  args: unknown
): Promise<unknown> {
  const res = await fetch(`${CRM_BASE_URL}/api/ai/receptionist/tools`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${bearer}`,
    },
    body: JSON.stringify({ tool, arguments: args }),
  });
  return res.json();
}

async function appendTranscript(bearer: string, text: string) {
  await fetch(`${CRM_BASE_URL}/api/ai/receptionist/transcript`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${bearer}`,
    },
    body: JSON.stringify({ transcriptAppend: text }),
  }).catch(() => undefined);
}

class CallBridge {
  private openai: WebSocket | null = null;
  private streamSid: string | null = null;
  private session: SessionBootstrap | null = null;
  private closed = false;
  private fatalOpenAi = false;
  /** While the model is speaking, ignore Twilio mic audio to avoid echo false-turns. */
  private assistantSpeaking = false;
  private maxTimer: ReturnType<typeof setTimeout> | null = null;
  private pendingFnArgs: Record<string, string> = {};
  private leavingForHandoff = false;

  constructor(private twilioWs: WebSocket) {}

  async startFromTwilioMessage(msg: Record<string, unknown>) {
    if (msg.event === "start") {
      const start = msg.start as {
        streamSid: string;
        customParameters?: Record<string, string>;
      };
      this.streamSid = start.streamSid;
      const token = start.customParameters?.token;
      if (!token) {
        log("Missing stream token");
        this.twilioWs.close();
        return;
      }
      try {
        this.session = await bootstrapSession(token);
        await this.openOpenAI();
        const maxMinutes = clampMaxMinutes(this.session.maxCallMinutes);
        const ms = maxMinutes * 60 * 1000;
        log("Max call timer armed", { maxMinutes, ms });
        this.maxTimer = setTimeout(() => void this.softTimeout(), ms);
        log("Session active", this.session.receptionistCallId);
      } catch (err) {
        log("Bootstrap failed", err);
        await this.failToVoicemail();
      }
      return;
    }

    if (msg.event === "media" && this.openai?.readyState === WebSocket.OPEN) {
      if (this.assistantSpeaking || this.leavingForHandoff) return;
      const media = msg.media as { payload: string };
      // Twilio payload is already base64 μ-law @ 8kHz — pass through as audio/pcmu.
      this.openai.send(
        JSON.stringify({
          type: "input_audio_buffer.append",
          audio: media.payload,
        })
      );
      return;
    }

    if (msg.event === "stop") {
      this.shutdown("COMPLETED");
    }
  }

  private async openOpenAI() {
    if (!OPENAI_API_KEY || !this.session) throw new Error("OpenAI not configured");

    const url = `wss://api.openai.com/v1/realtime?model=${encodeURIComponent(REALTIME_MODEL)}`;
    this.openai = new WebSocket(url, {
      headers: {
        Authorization: `Bearer ${OPENAI_API_KEY}`,
      },
    });

    await new Promise<void>((resolve, reject) => {
      this.openai!.once("open", () => resolve());
      this.openai!.once("error", (err) => reject(err));
    });

    const voice = this.session.voice || "alloy";
    this.openai.send(
      JSON.stringify({
        type: "session.update",
        session: {
          type: "realtime",
          model: REALTIME_MODEL,
          instructions: this.session.instructions,
          output_modalities: ["audio"],
          audio: {
            input: {
              format: { type: "audio/pcmu" },
              // Longer silence + higher threshold reduces false "caller spoke" turns from line noise/echo.
              turn_detection: {
                type: "server_vad",
                threshold: 0.7,
                prefix_padding_ms: 400,
                silence_duration_ms: 900,
              },
              transcription: { model: "whisper-1" },
            },
            output: {
              format: { type: "audio/pcmu" },
              voice,
            },
          },
          tools: this.session.tools,
          tool_choice: "auto",
        },
      })
    );

    this.openai.send(
      JSON.stringify({
        type: "response.create",
        response: {
          output_modalities: ["audio"],
          instructions:
            "Greet the caller now in English with the required automation disclosure. Then stop and wait.",
        },
      })
    );

    this.openai.on("message", (raw) => {
      void this.onOpenAIMessage(raw.toString());
    });
    this.openai.on("error", (err) => {
      log("OpenAI socket error", err);
      this.fatalOpenAi = true;
    });
    this.openai.on("close", (code, reason) => {
      log("OpenAI socket closed", code, reason?.toString?.() || reason);
      if (!this.closed && !this.leavingForHandoff) {
        log("OpenAI closed; falling back to voicemail", { fatal: this.fatalOpenAi });
        void this.failToVoicemail();
      }
    });
  }

  private clearInputBuffer() {
    if (this.openai?.readyState !== WebSocket.OPEN) return;
    try {
      this.openai.send(JSON.stringify({ type: "input_audio_buffer.clear" }));
    } catch {
      /* ignore */
    }
  }

  private async onOpenAIMessage(raw: string) {
    let event: Record<string, unknown>;
    try {
      event = JSON.parse(raw);
    } catch {
      return;
    }

    const type = String(event.type || "");

    if (type === "error") {
      this.fatalOpenAi = true;
      log("OpenAI error event", JSON.stringify(event).slice(0, 800));
      return;
    }

    if (type === "session.updated" || type === "session.created") {
      log(type);
      return;
    }

    if (type === "response.created" || type === "output_audio_buffer.started") {
      this.assistantSpeaking = true;
      this.clearInputBuffer();
      return;
    }

    if (
      type === "response.done" ||
      type === "response.output_audio.done" ||
      type === "output_audio_buffer.stopped" ||
      type === "response.cancelled"
    ) {
      // Keep suppressing briefly after audio ends so tail echo doesn't trigger a turn.
      if (type === "response.done" || type === "response.cancelled") {
        setTimeout(() => {
          this.assistantSpeaking = false;
          this.clearInputBuffer();
        }, 400);
      }
      return;
    }

    if (
      (type === "response.output_audio.delta" || type === "response.audio.delta") &&
      this.streamSid
    ) {
      this.assistantSpeaking = true;
      const delta = String(event.delta || "");
      this.twilioWs.send(
        JSON.stringify({
          event: "media",
          streamSid: this.streamSid,
          media: { payload: delta },
        })
      );
      return;
    }

    if (
      type === "conversation.item.input_audio_transcription.completed" ||
      type === "conversation.item.input_audio.transcription.completed"
    ) {
      const transcript = String(event.transcript || "");
      if (transcript && this.session) {
        await appendTranscript(this.session.toolBearer, `\nCaller: ${transcript}`);
      }
      return;
    }

    if (
      type === "response.output_audio_transcript.done" ||
      type === "response.audio_transcript.done"
    ) {
      const transcript = String(event.transcript || "");
      if (transcript && this.session) {
        await appendTranscript(this.session.toolBearer, `\nReceptionist: ${transcript}`);
      }
      return;
    }

    if (type === "response.function_call_arguments.delta") {
      const callId = String(event.call_id || "");
      this.pendingFnArgs[callId] =
        (this.pendingFnArgs[callId] || "") + String(event.delta || "");
      return;
    }

    if (type === "response.function_call_arguments.done") {
      const callId = String(event.call_id || "");
      const name = String(event.name || "");
      const argText = String(event.arguments || this.pendingFnArgs[callId] || "{}");
      delete this.pendingFnArgs[callId];
      await this.handleToolCall(callId, name, argText);
    }
  }

  private async handleToolCall(callId: string, name: string, argText: string) {
    if (!this.session || !this.openai) return;
    let args: unknown = {};
    try {
      args = JSON.parse(argText || "{}");
    } catch {
      args = {};
    }
    if (args && typeof args === "object" && !("idempotencyKey" in (args as object))) {
      (args as Record<string, unknown>).idempotencyKey = randomUUID();
    }

    log("Tool call", name);
    let result: unknown;
    try {
      result = await callTool(this.session.toolBearer, name, args);
    } catch (err) {
      log("Tool HTTP failed", name, err);
      result = { ok: false, error: "Tool request failed", code: "TOOL_HTTP" };
    }

    if (this.openai.readyState !== WebSocket.OPEN) return;

    this.openai.send(
      JSON.stringify({
        type: "conversation.item.create",
        item: {
          type: "function_call_output",
          call_id: callId,
          output: JSON.stringify(result),
        },
      })
    );

    const handoff = name === "transfer_to_human" || name === "fallback_voicemail";
    const ok = Boolean((result as { ok?: boolean } | null)?.ok);

    if (handoff && ok) {
      // Do not speak again — Twilio is leaving the Media Stream for dial/voicemail.
      this.leavingForHandoff = true;
      this.assistantSpeaking = false;
      setTimeout(() => {
        this.shutdown(name === "transfer_to_human" ? "TRANSFERRED" : "VOICEMAIL");
      }, 750);
      return;
    }

    this.openai.send(
      JSON.stringify({
        type: "response.create",
        response: {
          output_modalities: ["audio"],
          instructions: handoff
            ? "Briefly apologize that transfer failed and offer voicemail or to try again."
            : "Continue the conversation. If you just asked a question, stop and wait for the caller.",
        },
      })
    );
  }

  private async softTimeout() {
    if (this.closed || !this.session) return;
    log("Soft timeout — max call duration reached");
    try {
      const result = (await callTool(this.session.toolBearer, "transfer_to_human", {
        reason: "max_duration",
      })) as { ok?: boolean };
      if (!result?.ok) await this.failToVoicemail();
      else {
        this.leavingForHandoff = true;
        setTimeout(() => this.shutdown("TRANSFERRED"), 750);
      }
    } catch {
      await this.failToVoicemail();
    }
  }

  private async failToVoicemail() {
    if (this.leavingForHandoff) return;
    if (!this.session) {
      this.twilioWs.close();
      return;
    }
    try {
      await callTool(this.session.toolBearer, "fallback_voicemail", {
        reason: "sideband_failure",
      });
      this.leavingForHandoff = true;
    } catch (err) {
      log("Voicemail fallback failed", err);
    }
    this.shutdown("VOICEMAIL");
  }

  private shutdown(status: string) {
    if (this.closed) return;
    this.closed = true;
    if (this.maxTimer) clearTimeout(this.maxTimer);
    if (this.session) {
      void fetch(`${CRM_BASE_URL}/api/ai/receptionist/transcript`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${this.session.toolBearer}`,
        },
        body: JSON.stringify({ status }),
      }).catch(() => undefined);
    }
    try {
      this.openai?.close();
    } catch {
      /* ignore */
    }
    try {
      this.twilioWs.close();
    } catch {
      /* ignore */
    }
  }
}

const server = http.createServer((_req, res) => {
  res.writeHead(200, { "Content-Type": "application/json" });
  res.end(JSON.stringify({ ok: true, service: "receptionist-sideband" }));
});

const wss = new WebSocketServer({ server, path: "/twilio/media" });

wss.on("connection", (ws) => {
  log("Twilio stream connected");
  const bridge = new CallBridge(ws);
  ws.on("message", (data) => {
    try {
      const msg = JSON.parse(data.toString()) as Record<string, unknown>;
      void bridge.startFromTwilioMessage(msg);
    } catch (err) {
      log("Bad Twilio message", err);
    }
  });
  ws.on("close", () => log("Twilio stream closed"));
});

server.listen(PORT, () => {
  log(`Receptionist sideband listening on :${PORT} (WSS path /twilio/media)`);
  if (!CRM_BASE_URL) log("WARNING: CRM_BASE_URL unset");
  if (!OPENAI_API_KEY) log("WARNING: OPENAI_API_KEY unset");
});
