import type { SessionUser } from "@/lib/api-auth";
import { getOpenAIApiKey } from "@/lib/openai/client";
import { prisma } from "@/lib/prisma";
import { runStormAiTool } from "./execute";
import { stormAiToolsForRole } from "./permissions";
import { buildStormAiSystemPrompt, sanitizeToolPayload } from "./prompt";
import type { StormAiPageContext } from "./types";

const MAX_TOOL_ROUNDS = 8;

type ChatMessage = {
  role: "system" | "user" | "assistant" | "tool";
  content: string | null;
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

export async function runStormAiTurn(opts: {
  user: SessionUser;
  conversationId: string;
  content: string;
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

  if (!conversation.title) {
    await prisma.stormAiConversation.update({
      where: { id: conversation.id },
      data: { title: opts.content.slice(0, 80) },
    });
  }

  await prisma.stormAiMessage.create({
    data: {
      conversationId: conversation.id,
      userId: opts.user.id,
      role: "user",
      content: opts.content,
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
      question: opts.content,
      tools: [],
      ok: false,
      model: stormAiModel(),
      error: "OPENAI_API_KEY is not configured",
    });
    return {
      warning: "Storm AI is not configured (missing OPENAI_API_KEY).",
      messages: await listMessages(conversation.id),
    };
  }

  const messages: ChatMessage[] = [
    {
      role: "system",
      content: buildStormAiSystemPrompt({
        user: opts.user,
        timezone,
        nowIso: new Date().toISOString(),
        pageContext: opts.pageContext,
      }),
    },
    ...history.map((m) => ({
      role: m.role as "user" | "assistant",
      content: m.content,
    })),
  ];

  const toolsUsed: Array<{ name: string; args: unknown }> = [];
  let promptTokens = 0;
  let completionTokens = 0;
  let assistantText = "";

  try {
    for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
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
          tool_choice: "auto",
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
          const result = await runStormAiTool(opts.user, call.function.name, parsed, {
            conversationId: conversation.id,
          });
          const payload = sanitizeToolPayload(result, 8000);
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

      assistantText = (message.content ?? "").trim();
      break;
    }

    if (!assistantText) {
      assistantText =
        "I wasn’t able to finish that request. Try asking again with a more specific question.";
    }

    await prisma.stormAiMessage.create({
      data: {
        conversationId: conversation.id,
        userId: opts.user.id,
        role: "assistant",
        content: assistantText,
        usageJson: { promptTokens, completionTokens },
      },
    });

    await prisma.stormAiConversation.update({
      where: { id: conversation.id },
      data: { updatedAt: new Date() },
    });

    await writeAudit({
      user: opts.user,
      conversationId: conversation.id,
      question: opts.content,
      tools: toolsUsed,
      ok: true,
      model: stormAiModel(),
      responsePreview: assistantText.slice(0, 500),
      promptTokens,
      completionTokens,
    });

    return { messages: await listMessages(conversation.id) };
  } catch (err) {
    const error = err instanceof Error ? err.message : "Storm AI failed";
    await writeAudit({
      user: opts.user,
      conversationId: conversation.id,
      question: opts.content,
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
    };
  }
}

async function listMessages(conversationId: string) {
  const rows = await prisma.stormAiMessage.findMany({
    where: { conversationId, role: { in: ["user", "assistant"] } },
    orderBy: { createdAt: "asc" },
  });
  return rows.map((m) => ({
    id: m.id,
    role: m.role,
    content: m.content,
    createdAt: m.createdAt.toISOString(),
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
