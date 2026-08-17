import { createHash } from "crypto";
import type { SessionUser } from "@/lib/api-auth";
import { getOpenAIApiKey } from "@/lib/openai/client";
import { buildStormAiSystemPrompt } from "./prompt";
import { stormAiToolsForRole } from "./permissions";
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

export function buildStormAiRealtimeInstructions(opts: {
  user: SessionUser;
  timezone: string;
  pageContext?: StormAiPageContext | null;
  videoMode?: boolean;
}) {
  const base = buildStormAiSystemPrompt({
    user: opts.user,
    timezone: opts.timezone,
    nowIso: new Date().toISOString(),
    pageContext: opts.pageContext,
  });

  const videoBlock = opts.videoMode
    ? `
The technician has video mode on. Still camera frames arrive automatically while they speak and periodically from the live preview (not a continuous video stream).
When a frame arrives, look at it carefully. For part ID questions, describe what you see then call search_parts_info / get_parts_info.
Frames are also saved to the active job when possible—you do not need a tool to save them.
When sharing a manual from get_parts_info, tell the tech to open the manual link in chat (use the exact manualUrl as a markdown link).
Ground answers in the latest frame plus tool results. Never invent part numbers or manuals.`
    : "";

  return `${base}

You are speaking aloud to a field technician over a live voice connection.
Keep answers short and conversational—one or two sentences when possible, then stop and listen.
Never invent CRM facts; call tools when you need data.
For diagnostics, walk one step at a time (test, then wait for their answer).
When identifying a part from description or a camera frame, search the parts library before guessing.
If a tool fails or returns nothing, say so plainly.
After every tool call, you must speak a short result to the technician immediately—never go silent while “searching.”${videoBlock}`;
}

export function buildRealtimeSessionConfig(opts: {
  user: SessionUser;
  timezone: string;
  pageContext?: StormAiPageContext | null;
  voice?: string;
  videoMode?: boolean;
}) {
  const model = stormAiRealtimeModel();
  const voice = opts.voice || stormAiRealtimeVoice();
  return {
    type: "realtime" as const,
    model,
    instructions: buildStormAiRealtimeInstructions(opts),
    output_modalities: ["audio"] as string[],
    tools: toRealtimeTools(opts.user.role),
    tool_choice: "auto" as const,
    audio: {
      input: {
        format: { type: "audio/pcm", rate: 24000 },
        turn_detection: {
          type: "server_vad",
          // Higher threshold = less barge-in from wind, tools, and background noise.
          threshold: 0.78,
          prefix_padding_ms: 400,
          // Longer silence before the model decides the tech finished speaking.
          silence_duration_ms: 900,
          interrupt_response: true,
          create_response: true,
        },
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

  const session = buildRealtimeSessionConfig(opts);
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
