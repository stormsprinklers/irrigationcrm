import { NextResponse } from "next/server";
import { requireSessionUser, unauthorizedResponse } from "@/lib/api-auth";
import { serializeSeoTask } from "@/lib/marketing/seo-ai";
import { prisma } from "@/lib/prisma";

export async function GET() {
  try {
    const user = await requireSessionUser();
    const tasks = await prisma.seoTask.findMany({
      where: { companyId: user.companyId },
      orderBy: [{ completed: "asc" }, { priority: "asc" }, { createdAt: "desc" }],
    });

    return NextResponse.json({
      tasks: tasks.map(serializeSeoTask),
    });
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return unauthorizedResponse();
    }
    const message = error instanceof Error ? error.message : "Failed to load SEO tasks";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
