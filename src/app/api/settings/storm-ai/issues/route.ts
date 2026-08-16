import { NextRequest, NextResponse } from "next/server";
import { requireSessionUser, unauthorizedResponse } from "@/lib/api-auth";
import { prisma } from "@/lib/prisma";

function forbid(role: string) {
  return role !== "ADMIN" && role !== "MANAGER";
}

function serializeIssue(issue: {
  keywords: unknown;
  [key: string]: unknown;
}) {
  return {
    ...issue,
    keywords: Array.isArray(issue.keywords) ? issue.keywords : [],
  };
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
        ...issue,
        keywords: Array.isArray(issue.keywords) ? issue.keywords : [],
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
      trigger?: string;
      description?: string;
      keywords?: string[];
    };
    const name = body.name?.trim();
    if (!name) return NextResponse.json({ error: "Name required" }, { status: 400 });
    const count = await prisma.techAssistIssue.count({ where: { companyId: user.companyId } });
    const issue = await prisma.techAssistIssue.create({
      data: {
        companyId: user.companyId,
        name,
        trigger: body.trigger?.trim() || name,
        description: body.description?.trim() || null,
        keywords: Array.isArray(body.keywords) ? body.keywords : [],
        sortOrder: count,
      },
    });
    return NextResponse.json(serializeIssue(issue), { status: 201 });
  } catch {
    return unauthorizedResponse();
  }
}
