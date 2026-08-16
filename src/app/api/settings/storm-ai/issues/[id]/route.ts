import { NextRequest, NextResponse } from "next/server";
import { Prisma, TechAssistNodeType } from "@prisma/client";
import { requireSessionUser, unauthorizedResponse } from "@/lib/api-auth";
import { prisma } from "@/lib/prisma";

function forbid(role: string) {
  return role !== "ADMIN" && role !== "MANAGER";
}

function serializeIssue(issue: {
  id: string;
  name: string;
  description: string | null;
  entryNodeId: string | null;
  active: boolean;
  sortOrder: number;
  nodes?: unknown;
  [key: string]: unknown;
}) {
  return {
    id: issue.id,
    name: issue.name,
    description: issue.description,
    entryNodeId: issue.entryNodeId,
    active: issue.active,
    sortOrder: issue.sortOrder,
    nodes: issue.nodes,
  };
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
    return NextResponse.json(serializeIssue(issue));
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
    if (typeof body.name === "string") {
      data.name = body.name.trim();
      data.trigger = body.name.trim();
    }
    if (typeof body.description === "string" || body.description === null) {
      data.description = typeof body.description === "string" ? body.description.trim() : null;
    }
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
    return NextResponse.json(serializeIssue(issue));
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
      description?: string | null;
      entryNodeId?: string | null;
      active?: boolean;
      nodes?: Array<{
        id: string;
        type: TechAssistNodeType;
        title: string;
        body: string;
        config?: Record<string, unknown>;
        sortOrder: number;
      }>;
    };

    const incoming = (body.nodes ?? []).filter((n) => n.type !== "BRANCH");
    const keepIds = incoming.map((n) => n.id);
    const name = body.name?.trim() || existing.name;

    await prisma.$transaction(async (tx) => {
      await tx.techAssistIssue.update({
        where: { id },
        data: {
          name,
          trigger: name,
          description:
            body.description === undefined
              ? existing.description
              : body.description?.trim() || null,
          keywords: [] as Prisma.InputJsonValue,
          entryNodeId: body.entryNodeId === undefined ? existing.entryNodeId : body.entryNodeId,
          ...(typeof body.active === "boolean" ? { active: body.active } : {}),
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
            type: node.type === "BRANCH" ? "DIAGNOSTIC" : node.type,
            title: node.title.trim() || node.type,
            body: node.body ?? "",
            config: (node.config ?? {}) as Prisma.InputJsonValue,
            sortOrder: node.sortOrder,
          },
          update: {
            type: node.type === "BRANCH" ? "DIAGNOSTIC" : node.type,
            title: node.title.trim() || node.type,
            body: node.body ?? "",
            config: (node.config ?? {}) as Prisma.InputJsonValue,
            sortOrder: node.sortOrder,
          },
        });
      }
    });

    const issue = await prisma.techAssistIssue.findFirst({
      where: { id },
      include: { nodes: { orderBy: { sortOrder: "asc" } } },
    });
    return NextResponse.json(serializeIssue(issue!));
  } catch {
    return unauthorizedResponse();
  }
}
