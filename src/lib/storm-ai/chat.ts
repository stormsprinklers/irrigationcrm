import type { SessionUser } from "@/lib/api-auth";
import { getOpenAIApiKey } from "@/lib/openai/client";
import { prisma } from "@/lib/prisma";
import {
  attachmentsToOpenAiImageParts,
  parseStoredAttachments,
  serializeAttachments,
  storeStormAiImages,
  type StormAiImageInput,
  type StormAiStoredAttachment,
} from "./attachments";
import { runStormAiTool } from "./execute";
import { parsePartsCardFromAttachments, buildPartsChatCard } from "./parts-card";
import { stormAiToolsForRole } from "./permissions";
import { buildStormAiSystemPrompt, sanitizeToolPayload } from "./prompt";
import { formatPolicyCheckForTurn } from "./policies";
import type { StormAiPageContext } from "./types";

const MAX_TOOL_ROUNDS = 8;
/** Include images from at most this many recent user turns (token control). */
const MAX_IMAGE_HISTORY_TURNS = 2;

type ContentPart =
  | { type: "text"; text: string }
  | { type: "image_url"; image_url: { url: string } };

type ChatMessage = {
  role: "system" | "user" | "assistant" | "tool";
  content: string | null | ContentPart[];
  tool_calls?: Array<{
    id: string;
    type: "function";
    function: { name: string; arguments: string };
  }>;
  tool_call_id?: string;
  name?: string;
};

function stormAiModel() {
  return process.env.STORM_AI_MODEL?.trim() || "gpt-4o";
}

const DEFAULT_PHOTO_PROMPT =
  "What part is this? Identify it from our parts library if possible.";

export async function runStormAiTurn(opts: {
  user: SessionUser;
  conversationId: string;
  content: string;
  images?: StormAiImageInput[];
  pageContext?: StormAiPageContext | null;
}) {
  const conversation = await prisma.stormAiConversation.findFirst({
    where: {
      id: opts.conversationId,
      userId: opts.user.id,
      companyId: opts.user.companyId,
    },
  });
  if (!conversation) {
    return { error: "Conversation not found", status: 404 as const };
  }

  const company = await prisma.company.findUnique({
    where: { id: opts.user.companyId },
    select: { timezone: true },
  });
  const timezone = company?.timezone || "America/Denver";

  const hasImages = (opts.images?.length ?? 0) > 0;
  const content =
    opts.content.trim() || (hasImages ? DEFAULT_PHOTO_PROMPT : "");
  if (!content) {
    return { error: "Message is required", status: 400 as const };
  }

  let storedAttachments: StormAiStoredAttachment[] = [];
  if (hasImages) {
    try {
      storedAttachments = await storeStormAiImages({
        companyId: opts.user.companyId,
        conversationId: conversation.id,
        images: opts.images!,
      });
    } catch (err) {
      console.error("[storm-ai] image upload failed", err);
      return {
        error: "Could not upload photo(s). Check blob storage configuration.",
        status: 500 as const,
      };
    }
    if (!storedAttachments.length) {
      return {
        error: "No valid images (use JPEG, PNG, or WebP under 8MB).",
        status: 400 as const,
      };
    }
  }

  if (!conversation.title) {
    const titleSeed = opts.content.trim() || (hasImages ? "Photo question" : content);
    await prisma.stormAiConversation.update({
      where: { id: conversation.id },
      data: { title: titleSeed.slice(0, 80) },
    });
  }

  await prisma.stormAiMessage.create({
    data: {
      conversationId: conversation.id,
      userId: opts.user.id,
      role: "user",
      content,
      attachmentsJson: storedAttachments.length ? (storedAttachments as never) : undefined,
    },
  });

  const history = await prisma.stormAiMessage.findMany({
    where: { conversationId: conversation.id, role: { in: ["user", "assistant"] } },
    orderBy: { createdAt: "asc" },
    take: 40,
  });

  const apiKey = getOpenAIApiKey();
  if (!apiKey) {
    await writeAudit({
      user: opts.user,
      conversationId: conversation.id,
      question: content,
      tools: [],
      ok: false,
      model: stormAiModel(),
      error: "OPENAI_API_KEY is not configured",
    });
    return {
      warning: "Storm AI is not configured (missing OPENAI_API_KEY).",
      messages: await listMessages(conversation.id),
      debugLog: [
        {
          level: "error" as const,
          message: "OPENAI_API_KEY is not configured",
        },
      ],
    };
  }

  const openAiHistory = await buildOpenAiHistory(history);
  const policyCheck = await formatPolicyCheckForTurn(opts.user.companyId, content);

  const messages: ChatMessage[] = [
    {
      role: "system",
      content: await buildStormAiSystemPrompt({
        user: opts.user,
        timezone,
        nowIso: new Date().toISOString(),
        pageContext: opts.pageContext,
      }),
    },
    ...(policyCheck ? [{ role: "system" as const, content: policyCheck }] : []),
    ...openAiHistory,
  ];

  const toolsUsed: Array<{ name: string; args: unknown }> = [];
  const debugLog: Array<{ level: "info" | "wait" | "ok" | "error"; message: string }> = [];
  let promptTokens = 0;
  let completionTokens = 0;
  let assistantText = "";
  let partsCard: Awaited<ReturnType<typeof buildPartsChatCard>> = null;

  debugLog.push({
    level: "info",
    message: `Text turn started${hasImages ? ` (${storedAttachments.length} photo(s))` : ""}`,
  });
  if (policyCheck) {
    debugLog.push({ level: "info", message: "Policy check context attached" });
  }

  try {
    for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
      debugLog.push({
        level: "wait",
        message: `Model round ${round + 1}/${MAX_TOOL_ROUNDS}…`,
      });
      const res = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: stormAiModel(),
          messages,
          tools: stormAiToolsForRole(opts.user.role),
          tool_choice:
            round === 0 && policyCheck
              ? { type: "function" as const, function: { name: "search_company_policies" } }
              : "auto",
        }),
      });

      if (!res.ok) {
        const errText = await res.text();
        throw new Error(errText || "OpenAI request failed");
      }

      const json = (await res.json()) as {
        usage?: { prompt_tokens?: number; completion_tokens?: number };
        choices?: Array<{
          message?: ChatMessage;
        }>;
      };
      promptTokens += json.usage?.prompt_tokens ?? 0;
      completionTokens += json.usage?.completion_tokens ?? 0;
      const message = json.choices?.[0]?.message;
      if (!message) throw new Error("Empty OpenAI response");

      if (message.tool_calls?.length) {
        messages.push({
          role: "assistant",
          content: message.content ?? null,
          tool_calls: message.tool_calls,
        });
        for (const call of message.tool_calls) {
          let parsed: Record<string, unknown> = {};
          try {
            parsed = JSON.parse(call.function.arguments || "{}") as Record<string, unknown>;
          } catch {
            parsed = {};
          }
          toolsUsed.push({
            name: call.function.name,
            args: sanitizeToolPayload(parsed, 1500),
          });
          debugLog.push({
            level: "wait",
            message: `Running tool ${call.function.name}…`,
          });
          const result = await runStormAiTool(opts.user, call.function.name, parsed, {
            conversationId: conversation.id,
          });
          const payload = sanitizeToolPayload(result, 8000);
          const toolOk =
            result &&
            typeof result === "object" &&
            "ok" in result &&
            (result as { ok?: unknown }).ok === false
              ? false
              : true;
          debugLog.push({
            level: toolOk ? "ok" : "error",
            message: toolOk
              ? `Tool ${call.function.name} finished`
              : `Tool ${call.function.name} returned an error`,
          });
          if (call.function.name === "search_parts_info" || !partsCard) {
            const card = await buildPartsChatCard(
              opts.user.companyId,
              call.function.name,
              result
            );
            if (card) {
              partsCard = card;
              debugLog.push({ level: "ok", message: "Parts card prepared for chat" });
            }
          }
          await prisma.stormAiMessage.create({
            data: {
              conversationId: conversation.id,
              userId: opts.user.id,
              role: "tool",
              content: JSON.stringify(payload),
              toolName: call.function.name,
              toolCallId: call.id,
            },
          });
          messages.push({
            role: "tool",
            tool_call_id: call.id,
            name: call.function.name,
            content: JSON.stringify(payload),
          });
        }
        continue;
      }

      assistantText = (typeof message.content === "string" ? message.content : "").trim();
      debugLog.push({
        level: "ok",
        message: assistantText
          ? `Assistant reply ready (${assistantText.length} chars)`
          : "Assistant returned an empty reply",
      });
      break;
    }

    if (!assistantText) {
      assistantText =
        "I wasn’t able to finish that request. Try asking again with a more specific question.";
      debugLog.push({ level: "wait", message: "Filled empty assistant reply with fallback text" });
    }

    await prisma.stormAiMessage.create({
      data: {
        conversationId: conversation.id,
        userId: opts.user.id,
        role: "assistant",
        content: assistantText,
        usageJson: { promptTokens, completionTokens },
        attachmentsJson: partsCard ? ([partsCard] as never) : undefined,
      },
    });

    await prisma.stormAiConversation.update({
      where: { id: conversation.id },
      data: { updatedAt: new Date() },
    });

    await writeAudit({
      user: opts.user,
      conversationId: conversation.id,
      question: content,
      tools: toolsUsed,
      ok: true,
      model: stormAiModel(),
      responsePreview: assistantText.slice(0, 500),
      promptTokens,
      completionTokens,
    });

    debugLog.push({
      level: "ok",
      message: `Text turn complete · tools=${toolsUsed.length} · tokens=${promptTokens + completionTokens}`,
    });

    return { messages: await listMessages(conversation.id), debugLog };
  } catch (err) {
    const error = err instanceof Error ? err.message : "Storm AI failed";
    debugLog.push({ level: "error", message: `Text turn failed: ${error.slice(0, 240)}` });
    await writeAudit({
      user: opts.user,
      conversationId: conversation.id,
      question: content,
      tools: toolsUsed,
      ok: false,
      model: stormAiModel(),
      error: error.slice(0, 2000),
      promptTokens,
      completionTokens,
    });
    return {
      warning: "I wasn’t able to retrieve that report.",
      messages: await listMessages(conversation.id),
      debugLog,
    };
  }
}

async function buildOpenAiHistory(
  history: Array<{
    role: string;
    content: string;
    attachmentsJson: unknown;
  }>
): Promise<ChatMessage[]> {
  const userTurnsWithImages = history
    .map((m, index) => ({ m, index }))
    .filter(
      ({ m }) => m.role === "user" && parseStoredAttachments(m.attachmentsJson).length > 0
    );
  const imageTurnIndexes = new Set(
    userTurnsWithImages.slice(-MAX_IMAGE_HISTORY_TURNS).map(({ index }) => index)
  );

  const out: ChatMessage[] = [];
  for (let i = 0; i < history.length; i++) {
    const m = history[i]!;
    if (m.role === "assistant") {
      out.push({ role: "assistant", content: m.content });
      continue;
    }
    if (m.role !== "user") continue;

    const attachments = parseStoredAttachments(m.attachmentsJson);
    if (!attachments.length || !imageTurnIndexes.has(i)) {
      const note =
        attachments.length > 0
          ? `\n\n[User attached ${attachments.length} photo(s) earlier in this chat.]`
          : "";
      out.push({ role: "user", content: `${m.content}${note}` });
      continue;
    }

    const imageParts = await attachmentsToOpenAiImageParts(attachments);
    if (!imageParts.length) {
      out.push({
        role: "user",
        content: `${m.content}\n\n[Photo attached but could not be loaded.]`,
      });
      continue;
    }

    out.push({
      role: "user",
      content: [{ type: "text", text: m.content }, ...imageParts],
    });
  }
  return out;
}

export async function listMessages(conversationId: string) {
  const rows = await prisma.stormAiMessage.findMany({
    where: { conversationId, role: { in: ["user", "assistant"] } },
    orderBy: { createdAt: "asc" },
  });
  return rows.map((m) => ({
    id: m.id,
    role: m.role,
    content: m.content,
    createdAt: m.createdAt.toISOString(),
    attachments: serializeAttachments(m.attachmentsJson),
    partsCard: parsePartsCardFromAttachments(m.attachmentsJson),
  }));
}

async function writeAudit(input: {
  user: SessionUser;
  conversationId: string;
  question: string;
  tools: unknown;
  ok: boolean;
  model: string;
  responsePreview?: string;
  promptTokens?: number;
  completionTokens?: number;
  error?: string;
}) {
  await prisma.stormAiAuditLog.create({
    data: {
      companyId: input.user.companyId,
      userId: input.user.id,
      conversationId: input.conversationId,
      question: input.question.slice(0, 4000),
      toolsJson: input.tools as never,
      ok: input.ok,
      model: input.model,
      responsePreview: input.responsePreview,
      promptTokens: input.promptTokens,
      completionTokens: input.completionTokens,
      error: input.error,
    },
  });
}
