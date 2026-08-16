import { NextRequest, NextResponse } from "next/server";
import { requireSessionUser, unauthorizedResponse } from "@/lib/api-auth";
import { prisma } from "@/lib/prisma";

function forbid(role: string) {
  return role !== "ADMIN" && role !== "MANAGER";
}

export async function GET() {
  try {
    const user = await requireSessionUser();
    if (forbid(user.role)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    const issues = await prisma.techAssistIssue.findMany({
      where: { companyId: user.companyId },
      include: { _count: { select: { nodes: true } } },
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    });
    return NextResponse.json({
      issues: issues.map((issue) => ({
        id: issue.id,
        name: issue.name,
        description: issue.description,
        active: issue.active,
        sortOrder: issue.sortOrder,
        nodeCount: issue._count.nodes,
      })),
    });
  } catch {
    return unauthorizedResponse();
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await requireSessionUser();
    if (forbid(user.role)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    const body = (await request.json()) as {
      name?: string;
      description?: string;
    };
    const name = body.name?.trim();
    if (!name) return NextResponse.json({ error: "Title required" }, { status: 400 });
    const count = await prisma.techAssistIssue.count({ where: { companyId: user.companyId } });
    const issue = await prisma.techAssistIssue.create({
      data: {
        companyId: user.companyId,
        name,
        // Kept for schema compatibility; matching uses title + description only.
        trigger: name,
        description: body.description?.trim() || null,
        keywords: [],
        sortOrder: count,
      },
    });
    return NextResponse.json(
      {
        id: issue.id,
        name: issue.name,
        description: issue.description,
        active: issue.active,
        sortOrder: issue.sortOrder,
      },
      { status: 201 }
    );
  } catch {
    return unauthorizedResponse();
  }
}
