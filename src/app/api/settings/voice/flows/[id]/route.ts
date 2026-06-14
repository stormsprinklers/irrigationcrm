import { NextRequest, NextResponse } from "next/server";
import { CallFlowNodeType, Prisma } from "@prisma/client";
import { requireSessionUser, unauthorizedResponse } from "@/lib/api-auth";
import { prisma } from "@/lib/prisma";

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
      await prisma.callFlowNode.deleteMany({ where: { flowId: id } });
      await prisma.callFlowNode.createMany({
        data: steps.map((step, index) => ({
          flowId: id,
          type: step.type,
          config: (step.config ?? {}) as Prisma.InputJsonValue,
          sortOrder: index,
        })),
      });
    }

    const flow = await prisma.callFlow.update({
      where: { id, companyId: user.companyId },
      data: {
        ...(name !== undefined ? { name } : {}),
        ...(description !== undefined ? { description } : {}),
        ...(entryNodeId !== undefined ? { entryNodeId } : {}),
        ...(afterHoursNodeId !== undefined ? { afterHoursNodeId } : {}),
      },
      include: { nodes: { orderBy: { sortOrder: "asc" } } },
    });

    if (!flow.entryNodeId && flow.nodes[0]) {
      await prisma.callFlow.update({
        where: { id: flow.id },
        data: { entryNodeId: flow.nodes[0].id },
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
