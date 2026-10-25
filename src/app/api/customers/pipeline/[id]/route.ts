import { NextRequest, NextResponse } from "next/server";
import { PipelineDeclineReason } from "@prisma/client";
import { forbiddenResponse, requireSessionUser, unauthorizedResponse } from "@/lib/api-auth";
import { canViewSalesPipeline } from "@/lib/customers/permissions";
import { prisma } from "@/lib/prisma";

const DECLINE_REASONS = new Set(Object.values(PipelineDeclineReason));

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireSessionUser(request);
    if (!canViewSalesPipeline(user.role)) return forbiddenResponse();
    const { id } = await params;
    const customer = await prisma.customer.findFirst({ where: { id, companyId: user.companyId }, select: { id: true } });
    if (!customer) return NextResponse.json({ error: "Customer not found" }, { status: 404 });
    const body = await request.json();
    const action = String(body.action ?? "");
    const now = new Date();
    if (action === "remove") {
      await prisma.customer.update({ where: { id }, data: { pipelineRemovedAt: now, pipelineRemovedById: user.id } });
    } else if (action === "decline") {
      const reason = String(body.reason ?? "").toUpperCase() as PipelineDeclineReason;
      if (!DECLINE_REASONS.has(reason)) {
        return NextResponse.json({ error: "Select a decline reason" }, { status: 400 });
      }
      await prisma.customer.update({
        where: { id },
        data: {
          pipelineDeclinedAt: now,
          pipelineDeclineReason: reason,
          pipelineDeclinedById: user.id,
          pipelineFollowUpsPausedAt: now,
          pipelineFollowUpsPausedById: user.id,
        },
      });
    } else if (action === "pause") {
      await prisma.customer.update({ where: { id }, data: { pipelineFollowUpsPausedAt: now, pipelineFollowUpsPausedById: user.id } });
    } else if (action === "resume") {
      await prisma.customer.update({
        where: { id },
        data: {
          pipelineFollowUpsPausedAt: null,
          pipelineFollowUpsPausedById: null,
          pipelineFollowUpsResumedAt: now,
        },
      });
    } else {
      return NextResponse.json({ error: "Unsupported pipeline action" }, { status: 400 });
    }
    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") return unauthorizedResponse();
    console.error("Pipeline customer action failed", error);
    return NextResponse.json({ error: error instanceof Error ? error.message : "Could not update pipeline customer" }, { status: 500 });
  }
}
