import { requireOpenAIApiKey } from "@/lib/openai/client";
import type {
  SeoAiRecommendation,
  SeoAiRecommendationsResponse,
  SeoReachContext,
  SeoTaskCategory,
} from "@/lib/marketing/seo-task-types";

const VALID_CATEGORIES = new Set<SeoTaskCategory>([
  "content",
  "backlinks",
  "technical",
  "local",
  "on-page",
  "other",
]);

function normalizeCategory(value: unknown): SeoTaskCategory {
  const text = String(value ?? "other")
    .toLowerCase()
    .trim();
  if (VALID_CATEGORIES.has(text as SeoTaskCategory)) {
    return text as SeoTaskCategory;
  }
  if (text.includes("link")) return "backlinks";
  if (text.includes("local")) return "local";
  if (text.includes("tech")) return "technical";
  if (text.includes("page") || text.includes("on-page")) return "on-page";
  if (text.includes("content") || text.includes("blog") || text.includes("guide")) return "content";
  return "other";
}

function parseRecommendations(raw: string): SeoAiRecommendationsResponse {
  const parsed = JSON.parse(raw) as {
    recommendations?: unknown;
    summary?: unknown;
  };

  if (!Array.isArray(parsed.recommendations)) {
    throw new Error("AI response missing recommendations array");
  }

  const recommendations: SeoAiRecommendation[] = parsed.recommendations
    .slice(0, 3)
    .map((item, index) => {
      if (!item || typeof item !== "object") {
        throw new Error("Invalid recommendation entry");
      }
      const row = item as Record<string, unknown>;
      const title = String(row.title ?? "").trim();
      const description = String(row.description ?? "").trim();
      const rationale = String(row.rationale ?? row.why ?? "").trim();
      if (!title || !description) {
        throw new Error("Each recommendation needs title and description");
      }
      const priorityRaw = Number(row.priority ?? index + 1);
      const priority = Number.isFinite(priorityRaw)
        ? Math.min(3, Math.max(1, Math.round(priorityRaw)))
        : index + 1;

      return {
        title,
        description,
        category: normalizeCategory(row.category),
        rationale: rationale || "High-impact based on current SEO reach data.",
        priority,
      };
    });

  if (recommendations.length < 3) {
    throw new Error("Expected 3 SEO recommendations from AI");
  }

  return {
    recommendations,
    summary: typeof parsed.summary === "string" ? parsed.summary.trim() : undefined,
  };
}

export async function generateSeoRecommendations(
  context: SeoReachContext
): Promise<SeoAiRecommendationsResponse> {
  const apiKey = requireOpenAIApiKey();

  const system = `You are an expert SEO strategist for local irrigation and sprinkler service companies.
Return ONLY valid JSON with this exact shape:
{
  "summary": "One sentence on the biggest SEO opportunity right now",
  "recommendations": [
    {
      "title": "Short actionable task title (max 80 chars)",
      "description": "Specific step-by-step instructions the team can execute this week. Include exact page titles, outreach targets, email angles, or page sections to add.",
      "category": "content|backlinks|technical|local|on-page|other",
      "rationale": "Why this is high value based on the data provided",
      "priority": 1
    }
  ]
}

Rules:
- Provide exactly 3 recommendations, ordered by priority (1 = highest value).
- Be SPECIFIC. Bad: "write blog posts", "get backlinks", "improve meta tags".
- Good: "Write a guide titled 'How to Winterize Your Sprinkler System in Utah County'", "Email Utah Valley Homebuilders Association offering a free spring startup checklist in exchange for a resource page link".
- Tie each tip to the company's actual keywords, cities, ranking gaps, Search Console queries, or weak pages when data is available.
- If organic ranking data shows competitors outranking them, reference those competitors or gaps.
- Avoid duplicating tasks listed in existingOpenTasks.
- Keep descriptions concrete and executable by a small marketing team (not enterprise SEO jargon).`;

  const user = `Company: ${context.companyName}
Website: ${context.websiteUrl ?? "unknown"}

SEO reach snapshot (JSON):
${JSON.stringify(context, null, 2)}`;

  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "gpt-4o-mini",
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
      max_tokens: 2200,
      temperature: 0.4,
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(err || "OpenAI request failed");
  }

  const data = (await res.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  const raw = data.choices?.[0]?.message?.content?.trim();
  if (!raw) throw new Error("No content from OpenAI");

  return parseRecommendations(raw);
}

export function serializeSeoTask(task: {
  id: string;
  title: string;
  description: string;
  category: string | null;
  rationale: string | null;
  priority: number;
  completed: boolean;
  completedAt: Date | null;
  source: string;
  batchId: string | null;
  createdAt: Date;
  updatedAt: Date;
}) {
  return {
    id: task.id,
    title: task.title,
    description: task.description,
    category: task.category,
    rationale: task.rationale,
    priority: task.priority,
    completed: task.completed,
    completedAt: task.completedAt?.toISOString() ?? null,
    source: task.source,
    batchId: task.batchId,
    createdAt: task.createdAt.toISOString(),
    updatedAt: task.updatedAt.toISOString(),
  };
}
