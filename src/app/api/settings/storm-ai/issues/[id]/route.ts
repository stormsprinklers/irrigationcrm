import { NextRequest, NextResponse } from "next/server";
import { TechAssistNodeType } from "@prisma/client";
import { requireSessionUser, unauthorizedResponse } from "@/lib/api-auth";
import { prisma } from "@/lib/prisma";

function forbid(role: string) {
  return role !== "ADMIN" && role !== "MANAGER";
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requireSessionUser();
    if (forbid(user.role)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    const { id } = await params;
    const issue = await prisma.techAssistIssue.findFirst({
      where: { id, companyId: user.companyId },
      include: { nodes: { orderBy: { sortOrder: "asc" } } },
    });
    if (!issue) return NextResponse.json({ error: "Not found" }, { status: 404 });
    return NextResponse.json({
      ...issue,
      keywords: Array.isArray(issue.keywords) ? issue.keywords : [],
    });
  } catch {
    return unauthorizedResponse();
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requireSessionUser();
    if (forbid(user.role)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    const { id } = await params;
    const existing = await prisma.techAssistIssue.findFirst({
      where: { id, companyId: user.companyId },
    });
    if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const body = (await request.json()) as Record<string, unknown>;
    const data: Record<string, unknown> = {};
    if (typeof body.name === "string") data.name = body.name.trim();
    if (typeof body.trigger === "string") data.trigger = body.trigger.trim();
    if (typeof body.description === "string" || body.description === null) {
      data.description = typeof body.description === "string" ? body.description.trim() : null;
    }
    if (Array.isArray(body.keywords)) data.keywords = body.keywords.map((k) => String(k));
    if (typeof body.active === "boolean") data.active = body.active;
    if (typeof body.sortOrder === "number") data.sortOrder = body.sortOrder;
    if (typeof body.entryNodeId === "string" || body.entryNodeId === null) {
      data.entryNodeId = body.entryNodeId;
    }

    const issue = await prisma.techAssistIssue.update({
      where: { id },
      data,
      include: { nodes: { orderBy: { sortOrder: "asc" } } },
    });
    return NextResponse.json({
      ...issue,
      keywords: Array.isArray(issue.keywords) ? issue.keywords : [],
    });
  } catch {
    return unauthorizedResponse();
  }
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requireSessionUser();
    if (forbid(user.role)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    const { id } = await params;
    const existing = await prisma.techAssistIssue.findFirst({
      where: { id, companyId: user.companyId },
    });
    if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });
    await prisma.techAssistSession.updateMany({
      where: { issueId: id, status: "ACTIVE" },
      data: { status: "ABANDONED" },
    });
    await prisma.techAssistIssue.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch {
    return unauthorizedResponse();
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requireSessionUser();
    if (forbid(user.role)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    const { id } = await params;
    const existing = await prisma.techAssistIssue.findFirst({
      where: { id, companyId: user.companyId },
      include: { nodes: true },
    });
    if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const body = (await request.json()) as {
      name?: string;
      trigger?: string;
      description?: string | null;
      keywords?: string[];
      entryNodeId?: string | null;
      nodes?: Array<{
        id: string;
        type: TechAssistNodeType;
        title: string;
        body: string;
        config?: Record<string, unknown>;
        sortOrder: number;
      }>;
    };

    const incoming = body.nodes ?? [];
    const keepIds = incoming.map((n) => n.id);

    await prisma.$transaction(async (tx) => {
      await tx.techAssistIssue.update({
        where: { id },
        data: {
          name: body.name?.trim() || existing.name,
          trigger: body.trigger?.trim() || existing.trigger,
          description:
            body.description === undefined
              ? existing.description
              : body.description?.trim() || null,
          keywords: Array.isArray(body.keywords) ? body.keywords : existing.keywords,
          entryNodeId: body.entryNodeId === undefined ? existing.entryNodeId : body.entryNodeId,
          ...("active" in body && typeof (body as { active?: unknown }).active === "boolean"
            ? { active: (body as { active: boolean }).active }
            : {}),
        },
      });

      if (keepIds.length === 0) {
        await tx.techAssistNode.deleteMany({ where: { issueId: id } });
      } else {
        await tx.techAssistNode.deleteMany({
          where: { issueId: id, id: { notIn: keepIds } },
        });
      }

      for (const node of incoming) {
        await tx.techAssistNode.upsert({
          where: { id: node.id },
          create: {
            id: node.id,
            issueId: id,
            type: node.type,
            title: node.title.trim() || node.type,
            body: node.body ?? "",
            config: node.config ?? {},
            sortOrder: node.sortOrder,
          },
          update: {
            type: node.type,
            title: node.title.trim() || node.type,
            body: node.body ?? "",
            config: node.config ?? {},
            sortOrder: node.sortOrder,
          },
        });
      }
    });

    const issue = await prisma.techAssistIssue.findFirst({
      where: { id },
      include: { nodes: { orderBy: { sortOrder: "asc" } } },
    });
    return NextResponse.json({
      ...issue,
      keywords: Array.isArray(issue?.keywords) ? issue.keywords : [],
    });
  } catch {
    return unauthorizedResponse();
  }
}
