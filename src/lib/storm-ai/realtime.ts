import { createHash } from "crypto";
import type { SessionUser } from "@/lib/api-auth";
import { getOpenAIApiKey } from "@/lib/openai/client";
import { buildStormAiSystemPrompt } from "./prompt";
import { stormAiToolsForRole } from "./permissions";
import {
  STORM_AI_INPUT_NOISE_REDUCTION,
  stormAiServerVad,
} from "./realtime-vad";
import type { StormAiPageContext } from "./types";

export type StormAiRealtimeTool = {
  type: "function";
  name: string;
  description: string;
  parameters: Record<string, unknown>;
};

export function stormAiRealtimeModel() {
  return (
    process.env.STORM_AI_REALTIME_MODEL?.trim() ||
    process.env.OPENAI_REALTIME_MODEL?.trim() ||
    "gpt-realtime"
  );
}

export function stormAiRealtimeVoice() {
  return process.env.STORM_AI_REALTIME_VOICE?.trim() || "alloy";
}

export function toRealtimeTools(role: string): StormAiRealtimeTool[] {
  return stormAiToolsForRole(role).map((tool) => ({
    type: "function" as const,
    name: tool.function.name,
    description: tool.function.description,
    parameters: tool.function.parameters,
  }));
}

export async function buildStormAiRealtimeInstructions(opts: {
  user: SessionUser;
  timezone: string;
  pageContext?: StormAiPageContext | null;
  videoMode?: boolean;
}) {
  const base = await buildStormAiSystemPrompt({
    user: opts.user,
    timezone: opts.timezone,
    nowIso: new Date().toISOString(),
    pageContext: opts.pageContext,
  });

  const videoBlock = opts.videoMode
    ? `
The technician has video mode on. A still camera frame is sent only when they ask a question or talk about what they are showing — not continuously.
When a frame arrives with their question, look at it carefully before answering. For part ID, describe what you see then call search_parts_info. The tool compares the frame to library photos and only confirms when a catalog image matches — wait for visualMatch.confirmed before naming a part.
Frames are also saved to the active job when possible—you do not need a tool to save them.
When sharing a manual from get_parts_info, tell the tech the photos are already shown in the chat panel — do not invent a link. Never read visualDescription or the full technical write-up.
Ground answers in the latest frame plus tool results. Never invent part numbers or manuals.`
    : "";

  return `${base}

You are speaking aloud to a field technician over a live voice connection.
Keep answers short and conversational—one or two sentences when possible, then stop and listen.
If you hear your own previous answer, ignore it and wait for the technician. Never repeat or mimic yourself.
Never invent CRM facts; call tools when you need data.
Always check company policy before answering how the company handles safety, property damage, technical standards, customer authorization, pricing/payments, or employee operations — call search_company_policies in the same turn.
For diagnostics, walk one step at a time (test, then wait for their answer).
When identifying a part from description or a camera frame, you MUST call search_parts_info in the same turn—never only say that you will search.
Do not tell the technician you are “searching” or “still waiting” unless a tool result just failed. After a tool returns, speak the answer immediately.
Parts photos and a short ID appear automatically in the chat panel after a parts lookup — tell them to look there rather than promising a link you send yourself. Never read visualDescription aloud. Never read the full technicalDescription; answer the question in a couple of sentences.${videoBlock}`;
}

export async function buildRealtimeSessionConfig(opts: {
  user: SessionUser;
  timezone: string;
  pageContext?: StormAiPageContext | null;
  voice?: string;
  videoMode?: boolean;
}) {
  const model = stormAiRealtimeModel();
  const voice = opts.voice || stormAiRealtimeVoice();
  const instructions = await buildStormAiRealtimeInstructions(opts);
  return {
    type: "realtime" as const,
    model,
    instructions,
    output_modalities: ["audio"] as string[],
    tools: toRealtimeTools(opts.user.role),
    tool_choice: "auto" as const,
    audio: {
      input: {
        format: { type: "audio/pcm", rate: 24000 },
        // Filter ambient noise before VAD so shop/truck sound is less likely to
        // register as a technician turn (false transcripts like "Thank you.").
        noise_reduction: STORM_AI_INPUT_NOISE_REDUCTION,
        turn_detection: stormAiServerVad({
          createResponse: !opts.videoMode,
          interruptResponse: false,
        }),
        transcription: { model: "whisper-1" },
      },
      output: {
        format: { type: "audio/pcm", rate: 24000 },
        voice,
      },
    },
  };
}

export function safetyIdentifierForUser(user: SessionUser) {
  return createHash("sha256")
    .update(`storm-ai:${user.companyId}:${user.id}`)
    .digest("hex")
    .slice(0, 64);
}

export type MintRealtimeClientSecretResult =
  | {
      clientSecret: string;
      expiresAt: number | null;
      model: string;
      voice: string;
      tools: StormAiRealtimeTool[];
    }
  | {
      error: string;
      status: number;
      detail?: string;
    };

export async function mintStormAiRealtimeClientSecret(opts: {
  user: SessionUser;
  timezone: string;
  pageContext?: StormAiPageContext | null;
  voice?: string;
  videoMode?: boolean;
}): Promise<MintRealtimeClientSecretResult> {
  const apiKey = getOpenAIApiKey();
  if (!apiKey) {
    return { error: "OPENAI_API_KEY is not configured", status: 503 };
  }

  const session = await buildRealtimeSessionConfig(opts);
  const res = await fetch("https://api.openai.com/v1/realtime/client_secrets", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      "OpenAI-Safety-Identifier": safetyIdentifierForUser(opts.user),
    },
    body: JSON.stringify({ session }),
  });

  if (!res.ok) {
    const errText = await res.text();
    console.error("[storm-ai realtime] client_secrets failed", errText.slice(0, 1000));
    return {
      error: "Could not start voice session with OpenAI.",
      status: 502,
      detail: errText.slice(0, 500),
    };
  }

  const data = (await res.json()) as {
    value?: string;
    client_secret?: { value?: string };
    expires_at?: number;
  };
  const value = data.value || data.client_secret?.value;
  if (!value) {
    return { error: "OpenAI returned no ephemeral key", status: 502 };
  }

  return {
    clientSecret: value,
    expiresAt: data.expires_at ?? null,
    model: session.model,
    voice: opts.voice || stormAiRealtimeVoice(),
    tools: session.tools,
  };
}
