import { NextRequest, NextResponse } from "next/server";
import { CallFlowNodeType, Prisma } from "@prisma/client";
import { requireSessionUser, unauthorizedResponse } from "@/lib/api-auth";
import { prisma } from "@/lib/prisma";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requireSessionUser();
    const { id } = await params;
    const flow = await prisma.callFlow.findFirst({
      where: { id, companyId: user.companyId },
      include: { nodes: { orderBy: { sortOrder: "asc" } } },
    });
    if (!flow) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    return NextResponse.json(flow);
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
    if (user.role !== "ADMIN" && user.role !== "MANAGER") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { id } = await params;
    const body = await request.json();
    const { name, description, entryNodeId, afterHoursNodeId, steps } = body as {
      name?: string;
      description?: string;
      entryNodeId?: string | null;
      afterHoursNodeId?: string | null;
      steps?: Array<{ id?: string; type: CallFlowNodeType; config?: Record<string, unknown> }>;
    };

    if (steps) {
      const keptIds = steps.map((s) => s.id).filter(Boolean) as string[];
      await prisma.callFlowNode.deleteMany({
        where: { flowId: id, ...(keptIds.length ? { id: { notIn: keptIds } } : {}) },
      });

      for (const [index, step] of steps.entries()) {
        const data = {
          type: step.type,
          config: (step.config ?? {}) as Prisma.InputJsonValue,
          sortOrder: index,
        };
        if (step.id) {
          await prisma.callFlowNode.updateMany({
            where: { id: step.id, flowId: id },
            data,
          });
        } else {
          await prisma.callFlowNode.create({
            data: { flowId: id, ...data },
          });
        }
      }
    }

    let flow = await prisma.callFlow.update({
      where: { id, companyId: user.companyId },
      data: {
        ...(name !== undefined ? { name } : {}),
        ...(description !== undefined ? { description } : {}),
        ...(entryNodeId !== undefined ? { entryNodeId } : {}),
        ...(afterHoursNodeId !== undefined ? { afterHoursNodeId } : {}),
      },
      include: { nodes: { orderBy: { sortOrder: "asc" } } },
    });

    // Derive open/closed entries from branch tags after steps persist (handles new node ids).
    if (steps) {
      const openFirst = flow.nodes.find((n) => {
        const branch = (n.config as { branch?: string } | null)?.branch;
        return branch !== "closed";
      });
      const closedFirst = flow.nodes.find((n) => {
        const branch = (n.config as { branch?: string } | null)?.branch;
        return branch === "closed";
      });
      flow = await prisma.callFlow.update({
        where: { id: flow.id },
        data: {
          entryNodeId: openFirst?.id ?? flow.nodes[0]?.id ?? null,
          afterHoursNodeId: closedFirst?.id ?? null,
        },
        include: { nodes: { orderBy: { sortOrder: "asc" } } },
      });
    } else if (!flow.entryNodeId && flow.nodes[0]) {
      flow = await prisma.callFlow.update({
        where: { id: flow.id },
        data: { entryNodeId: flow.nodes[0].id },
        include: { nodes: { orderBy: { sortOrder: "asc" } } },
      });
    }

    return NextResponse.json(flow);
  } catch {
    return unauthorizedResponse();
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requireSessionUser();
    if (user.role !== "ADMIN" && user.role !== "MANAGER") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { id } = await params;
    await prisma.callFlow.delete({ where: { id, companyId: user.companyId } });
    return NextResponse.json({ ok: true });
  } catch {
    return unauthorizedResponse();
  }
}
