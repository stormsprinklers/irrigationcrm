import { NextResponse } from "next/server";
import { requireSessionUser, unauthorizedResponse } from "@/lib/api-auth";
import { generateSeoRecommendations, serializeSeoTask } from "@/lib/marketing/seo-ai";
import { buildSeoReachContext } from "@/lib/marketing/seo-reach-context";
import { getOpenAIApiKey } from "@/lib/openai/client";
import { prisma } from "@/lib/prisma";
import { randomUUID } from "crypto";

export async function POST() {
  try {
    const user = await requireSessionUser();

    if (!getOpenAIApiKey()) {
      return NextResponse.json(
        { error: "OPENAI_API_KEY is not configured on the server" },
        { status: 503 }
      );
    }

    const context = await buildSeoReachContext(user.companyId);
    const ai = await generateSeoRecommendations(context);
    const batchId = randomUUID();

    const created = await prisma.$transaction(
      ai.recommendations.map((rec) =>
        prisma.seoTask.create({
          data: {
            companyId: user.companyId,
            title: rec.title,
            description: rec.description,
            category: rec.category,
            rationale: rec.rationale,
            priority: rec.priority,
            source: "ai",
            batchId,
          },
        })
      )
    );

    return NextResponse.json({
      summary: ai.summary ?? null,
      batchId,
      tasks: created.map(serializeSeoTask),
    });
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return unauthorizedResponse();
    }
    const message = error instanceof Error ? error.message : "Failed to generate SEO recommendations";
    const status = message.includes("OPENAI") ? 503 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
