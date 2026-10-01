import { NextRequest, NextResponse } from "next/server";
import { EstimateStatus } from "@prisma/client";
import { badRequestResponse, requireSessionUser, unauthorizedResponse } from "@/lib/api-auth";
import { getEstimateForCompany } from "@/lib/estimates/queries";
import {
  getEstimateCustomerPortalPath,
  notifyEstimateViaTemplates,
  type EstimateSendChannel,
} from "@/lib/notifications/estimate-notify";
import { onEstimateSent } from "@/lib/notifications/estimate-followup";
import { recordEstimateSentInSmsThread } from "@/lib/estimates/sms-thread-activity";
import { prisma } from "@/lib/prisma";

type Params = { params: Promise<{ id: string }> };

export async function POST(request: NextRequest, { params }: Params) {
  try {
    const user = await requireSessionUser();
    const { id } = await params;

    const estimate = await prisma.estimate.findFirst({
      where: { id, companyId: user.companyId },
      include: {
        customer: true,
        company: {
          select: {
            estimateDepositRequired: true,
            estimateDepositType: true,
            estimateDepositAmount: true,
            estimateDepositThreshold: true,
          },
        },
      },
    });

    if (!estimate) return NextResponse.json({ error: "Not found" }, { status: 404 });

    let channel: EstimateSendChannel | undefined;
    try {
      const body = (await request.json().catch(() => ({}))) as { channel?: string };
      if (body.channel === "email" || body.channel === "sms") {
        channel = body.channel;
      }
    } catch {
      /* empty body is fine — send both channels */
    }

    if (channel === "email" && !estimate.customer.email) {
      return badRequestResponse("Customer has no email address");
    }
    if (channel === "sms" && !estimate.customer.phone) {
      return badRequestResponse("Customer has no phone number");
    }
    if (!channel && !estimate.customer.email && !estimate.customer.phone) {
      return badRequestResponse("Customer must have an email or phone to send estimate");
    }

    // Snapshot the current company policy before rendering or sending customer documents.
    await prisma.estimate.update({
      where: { id },
      data: {
        depositRequired: estimate.company.estimateDepositRequired,
        depositType: estimate.company.estimateDepositType,
        depositAmount: estimate.company.estimateDepositAmount,
        depositThreshold: estimate.company.estimateDepositThreshold,
      },
    });

    const result = await notifyEstimateViaTemplates(id, user.companyId, channel);
    if (!result.emailSent && !result.smsSent) {
      return NextResponse.json(
        { error: "Failed to send estimate notification", skipped: result.skipped },
        { status: 503 }
      );
    }

    await prisma.estimate.update({
      where: { id },
      data: {
        status: EstimateStatus.SENT,
        sentAt: new Date(),
      },
    });

    if (result.smsSent && estimate.customer.phone) {
      await recordEstimateSentInSmsThread({
        companyId: user.companyId,
        customerId: estimate.customerId,
        customerPhone: estimate.customer.phone,
        estimateId: estimate.id,
        estimateNumber: estimate.estimateNumber,
        senderId: user.id,
      }).catch((error) => {
        // The customer notification already sent successfully. Do not report a
        // false send failure if the staff-only inbox activity cannot be saved.
        console.error("Could not add estimate activity to SMS thread", error);
      });
    }

    void onEstimateSent(id, user.companyId).catch((err) =>
      console.error("Estimate follow-up schedule error:", err)
    );

    const updated = await getEstimateForCompany(user.companyId, id);
    const portalPath = await getEstimateCustomerPortalPath(user.companyId, id);
    return NextResponse.json({ ...updated, portalPath, sendResult: result });
  } catch {
    return unauthorizedResponse();
  }
}
