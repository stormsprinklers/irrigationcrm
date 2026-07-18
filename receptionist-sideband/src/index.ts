/**
 * Twilio Media Streams ↔ OpenAI Realtime bridge for AI receptionist.
 *
 * Env:
 *   PORT / SIDEBAND_PORT
 *   CRM_BASE_URL — e.g. https://crm.example.com
 *   OPENAI_API_KEY
 *   OPENAI_REALTIME_MODEL — optional, default gpt-4o-realtime-preview
 */

import "dotenv/config";
import http from "http";
import { randomUUID } from "crypto";
import { WebSocketServer, WebSocket } from "ws";

const PORT = Number(process.env.PORT || process.env.SIDEBAND_PORT || 8090);
const CRM_BASE_URL = (process.env.CRM_BASE_URL || "").replace(/\/$/, "");
const OPENAI_API_KEY = process.env.OPENAI_API_KEY || "";
// GA Realtime models (preview gpt-4o-realtime-* + OpenAI-Beta header are retired).
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

function mulawToPcm16(mulaw: Buffer): Buffer {
  const pcm = Buffer.alloc(mulaw.length * 2);
  for (let i = 0; i < mulaw.length; i++) {
    let mu = ~mulaw[i];
    const sign = mu & 0x80;
    const exponent = (mu >> 4) & 0x07;
    const mantissa = mu & 0x0f;
    let sample = ((mantissa << 3) + 0x84) << exponent;
    sample -= 0x84;
    if (sign !== 0) sample = -sample;
    pcm.writeInt16LE(sample, i * 2);
  }
  return pcm;
}

function pcm16ToMulaw(pcm: Buffer): Buffer {
  const out = Buffer.alloc(Math.floor(pcm.length / 2));
  for (let i = 0; i < out.length; i++) {
    let sample = pcm.readInt16LE(i * 2);
    const sign = sample < 0 ? 0x80 : 0;
    if (sample < 0) sample = -sample;
    if (sample > 32635) sample = 32635;
    sample += 0x84;
    let exponent = 7;
    for (let expMask = 0x4000; (sample & expMask) === 0 && exponent > 0; expMask >>= 1) {
      exponent--;
    }
    const mantissa = (sample >> (exponent + 3)) & 0x0f;
    out[i] = ~(sign | (exponent << 4) | mantissa);
  }
  return out;
}

/** Naive upsample 8k PCM16 → 24k by repeating samples (Realtime often expects 24k). */
function upsample8kTo24k(pcm8: Buffer): Buffer {
  const samples = pcm8.length / 2;
  const out = Buffer.alloc(samples * 3 * 2);
  for (let i = 0; i < samples; i++) {
    const s = pcm8.readInt16LE(i * 2);
    out.writeInt16LE(s, i * 6);
    out.writeInt16LE(s, i * 6 + 2);
    out.writeInt16LE(s, i * 6 + 4);
  }
  return out;
}

function downsample24kTo8k(pcm24: Buffer): Buffer {
  const samples = Math.floor(pcm24.length / 6);
  const out = Buffer.alloc(samples * 2);
  for (let i = 0; i < samples; i++) {
    out.writeInt16LE(pcm24.readInt16LE(i * 6), i * 2);
  }
  return out;
}

class CallBridge {
  private openai: WebSocket | null = null;
  private streamSid: string | null = null;
  private session: SessionBootstrap | null = null;
  private closed = false;
  private maxTimer: ReturnType<typeof setTimeout> | null = null;
  private pendingFnArgs: Record<string, string> = {};

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
        this.maxTimer = setTimeout(
          () => void this.softTimeout(),
          (this.session.maxCallMinutes || 12) * 60 * 1000
        );
        log("Session active", this.session.receptionistCallId);
      } catch (err) {
        log("Bootstrap failed", err);
        await this.failToVoicemail();
      }
      return;
    }

    if (msg.event === "media" && this.openai?.readyState === WebSocket.OPEN) {
      const media = msg.media as { payload: string };
      const mulaw = Buffer.from(media.payload, "base64");
      const pcm8 = mulawToPcm16(mulaw);
      const pcm24 = upsample8kTo24k(pcm8);
      this.openai.send(
        JSON.stringify({
          type: "input_audio_buffer.append",
          audio: pcm24.toString("base64"),
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
    // GA Realtime: do NOT send OpenAI-Beta: realtime=v1 (rejected as beta_api_shape_disabled).
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
              format: { type: "audio/pcm", rate: 24000 },
              turn_detection: { type: "server_vad" },
              transcription: { model: "whisper-1" },
            },
            output: {
              format: { type: "audio/pcm", rate: 24000 },
              voice,
            },
          },
          tools: this.session.tools,
          tool_choice: "auto",
        },
      })
    );

    // Kick off greeting after session is configured
    this.openai.send(
      JSON.stringify({
        type: "response.create",
        response: {
          output_modalities: ["audio"],
          instructions: "Greet the caller now with the required automation disclosure.",
        },
      })
    );

    this.openai.on("message", (raw) => {
      void this.onOpenAIMessage(raw.toString());
    });
    this.openai.on("error", (err) => {
      log("OpenAI socket error", err);
    });
    this.openai.on("close", (code, reason) => {
      log("OpenAI socket closed", code, reason?.toString?.() || reason);
      if (!this.closed) void this.failToVoicemail();
    });
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
      log("OpenAI error event", JSON.stringify(event).slice(0, 800));
      return;
    }

    if (type === "session.updated" || type === "session.created") {
      log(type);
      return;
    }

    // GA: response.output_audio.delta; legacy beta: response.audio.delta
    if (
      (type === "response.output_audio.delta" || type === "response.audio.delta") &&
      this.streamSid
    ) {
      const delta = String(event.delta || "");
      const pcm24 = Buffer.from(delta, "base64");
      const pcm8 = downsample24kTo8k(pcm24);
      const mulaw = pcm16ToMulaw(pcm8);
      this.twilioWs.send(
        JSON.stringify({
          event: "media",
          streamSid: this.streamSid,
          media: { payload: mulaw.toString("base64") },
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
    const result = await callTool(this.session.toolBearer, name, args);

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
    this.openai.send(JSON.stringify({ type: "response.create" }));

    if (
      name === "transfer_to_human" ||
      name === "fallback_voicemail"
    ) {
      this.shutdown(name === "transfer_to_human" ? "TRANSFERRED" : "VOICEMAIL");
    }
  }

  private async softTimeout() {
    if (this.closed || !this.session) return;
    try {
      await callTool(this.session.toolBearer, "transfer_to_human", {
        reason: "max_duration",
      });
    } catch {
      await this.failToVoicemail();
    }
    this.shutdown("TRANSFERRED");
  }

  private async failToVoicemail() {
    if (!this.session) {
      this.twilioWs.close();
      return;
    }
    try {
      await callTool(this.session.toolBearer, "fallback_voicemail", {
        reason: "sideband_failure",
      });
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
