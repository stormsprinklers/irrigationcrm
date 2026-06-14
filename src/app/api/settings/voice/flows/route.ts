import { NextRequest, NextResponse } from "next/server";
import { CallFlowNodeType, Prisma } from "@prisma/client";
import { requireSessionUser, unauthorizedResponse } from "@/lib/api-auth";
import { prisma } from "@/lib/prisma";

export async function GET() {
  try {
    const user = await requireSessionUser();
    const flows = await prisma.callFlow.findMany({
      where: { companyId: user.companyId },
      include: { nodes: { orderBy: { sortOrder: "asc" } } },
      orderBy: { name: "asc" },
    });
    return NextResponse.json(flows);
  } catch {
    return unauthorizedResponse();
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await requireSessionUser();
    if (user.role !== "ADMIN" && user.role !== "MANAGER") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const body = await request.json();
    const { name, description, steps } = body as {
      name?: string;
      description?: string;
      steps?: Array<{ type: CallFlowNodeType; config?: Record<string, unknown> }>;
    };

    if (!name) {
      return NextResponse.json({ error: "Name required" }, { status: 400 });
    }

    const flow = await prisma.callFlow.create({
      data: {
        companyId: user.companyId,
        name,
        description: description ?? null,
        nodes: {
          create: (steps ?? [{ type: CallFlowNodeType.DIAL_GROUP, config: {} }]).map(
            (step, index) => ({
              type: step.type,
              config: (step.config ?? {}) as Prisma.InputJsonValue,
              sortOrder: index,
            })
          ),
        },
      },
      include: { nodes: true },
    });

    const entryNode = flow.nodes[0];
    if (entryNode) {
      await prisma.callFlow.update({
        where: { id: flow.id },
        data: { entryNodeId: entryNode.id },
      });
    }

    return NextResponse.json(flow, { status: 201 });
  } catch {
    return unauthorizedResponse();
  }
}
