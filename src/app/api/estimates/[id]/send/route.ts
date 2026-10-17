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
    const user = await requireSessionUser(request);
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

    let runAt: Date | undefined;
    let compose: { message: string; subject?: string } | undefined;
    let channel: EstimateSendChannel | undefined;
    try {
      const body = (await request.json().catch(() => ({}))) as { channel?: string; message?: string; subject?: string; runAt?: string };
      if (body.runAt) {
        runAt = new Date(body.runAt);
        if (!Number.isFinite(runAt.getTime()) || runAt.getTime() <= Date.now()) return badRequestResponse("Choose a future send time");
      }
      if (typeof body.message === "string") {
        if (!body.message.trim() || body.message.length > 10000) return badRequestResponse("Enter a message under 10,000 characters");
        compose = { message: body.message, subject: typeof body.subject === "string" ? body.subject.replace(/[\r\n]/g, " ").slice(0, 200) : undefined };
      }
      if (body.channel !== undefined && body.channel !== "email" && body.channel !== "sms") return badRequestResponse("Choose email or text");
      if (body.message !== undefined && typeof body.message !== "string") return badRequestResponse("Enter a message");
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

    if (runAt) {
      if (!channel || !compose) return badRequestResponse("Choose a channel and message");
      await prisma.notificationJob.create({data:{companyId:user.companyId,estimateId:id,runAt,event:`ESTIMATE_SCHEDULED_SEND:${JSON.stringify({channel,...compose})}`}});
      return NextResponse.json({scheduled:true,runAt:runAt.toISOString()});
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

    const result = await notifyEstimateViaTemplates(id, user.companyId, channel, compose);
    if (!result.emailSent && !result.smsSent) {
      return NextResponse.json(
        { error: "Failed to send estimate notification", skipped: result.skipped },
        { status: 503 }
      );
    }

    await prisma.estimate.updateMany({
      where: { id, companyId: user.companyId, status: {in: ["DRAFT", "SENT"]} },
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
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") return unauthorizedResponse();
    console.error("Estimate send failed", error);
    return NextResponse.json({ error: "The estimate could not be sent. Please try again." }, {status: 500});
  }
}

export async function GET(request: NextRequest, { params }: Params) {
  try {
    const user = await requireSessionUser(request);
    const { id } = await params;
    const estimate = await prisma.estimate.findFirst({ where: {id, companyId: user.companyId}, include: {customer: true, company: true} });
    if (!estimate) return NextResponse.json({error: "Not found"}, {status: 404});
    const link = await getEstimateCustomerPortalPath(user.companyId, id);
    if (!link) return badRequestResponse("Configure this company's customer portal before sending estimates");
    return NextResponse.json({ link, email: estimate.customer.email, phone: estimate.customer.phone,
      subject: `Your estimate from ${estimate.company.name}`,
      message: `Hi ${estimate.customer.name}, here is your estimate from ${estimate.company.name}. Please use the link below to review it.` });
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") return unauthorizedResponse();
    console.error("Estimate message preview failed", error);
    return NextResponse.json({error:"Could not load the estimate message"},{status:500});
  }
}
