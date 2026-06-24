import { NextRequest, NextResponse } from "next/server";
import { EstimateStatus } from "@prisma/client";
import { badRequestResponse, requireSessionUser, unauthorizedResponse } from "@/lib/api-auth";
import { getEstimateForCompany } from "@/lib/estimates/queries";
import { notifyEstimateViaTemplates } from "@/lib/notifications/estimate-notify";
import { onEstimateSent } from "@/lib/notifications/estimate-followup";
import { prisma } from "@/lib/prisma";

type Params = { params: Promise<{ id: string }> };

export async function POST(_request: NextRequest, { params }: Params) {
  try {
    const user = await requireSessionUser();
    const { id } = await params;

    const estimate = await prisma.estimate.findFirst({
      where: { id, companyId: user.companyId },
      include: { customer: true },
    });

    if (!estimate) return NextResponse.json({ error: "Not found" }, { status: 404 });
    if (!estimate.customer.email && !estimate.customer.phone) {
      return badRequestResponse("Customer must have an email or phone to send estimate");
    }

    const result = await notifyEstimateViaTemplates(id, user.companyId);
    if (!result.emailSent && !result.smsSent) {
      return NextResponse.json(
        { error: "Failed to send estimate notification", skipped: result.skipped },
        { status: 503 }
      );
    }

    await prisma.estimate.update({
      where: { id },
      data: { status: EstimateStatus.SENT },
    });

    void onEstimateSent(id, user.companyId).catch((err) =>
      console.error("Estimate follow-up schedule error:", err)
    );

    const updated = await getEstimateForCompany(user.companyId, id);
    return NextResponse.json(updated);
  } catch {
    return unauthorizedResponse();
  }
}
