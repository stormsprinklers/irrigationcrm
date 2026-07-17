import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifyMarketingUnsubscribeToken } from "@/lib/marketing/unsubscribe";

export async function GET(request: NextRequest) {
  const token = request.nextUrl.searchParams.get("token") ?? "";
  const verified = verifyMarketingUnsubscribeToken(token);
  if (!verified) {
    return new NextResponse(
      `<!DOCTYPE html><html><body style="font-family:Arial,sans-serif;padding:40px;text-align:center">
        <h1>Invalid or expired link</h1>
        <p>This unsubscribe link is not valid. Contact us if you need help.</p>
      </body></html>`,
      { status: 400, headers: { "Content-Type": "text/html; charset=utf-8" } }
    );
  }

  await prisma.customer.updateMany({
    where: { id: verified.customerId, companyId: verified.companyId },
    data: { marketingEmailOptOut: true },
  });

  // Exit active drip enrollments so they stop receiving marketing sequences.
  await prisma.campaignEnrollment.updateMany({
    where: {
      customerId: verified.customerId,
      status: "ACTIVE",
      campaign: { companyId: verified.companyId, type: "DRIP" },
    },
    data: { status: "CANCELLED" },
  });

  return new NextResponse(
    `<!DOCTYPE html><html><body style="font-family:Arial,sans-serif;max-width:480px;margin:40px auto;padding:24px;text-align:center">
      <h1 style="color:#102341">Unsubscribed from marketing</h1>
      <p style="color:#374151;line-height:1.5">You will no longer receive marketing emails. You will still get messages about appointments, invoices, and service updates.</p>
    </body></html>`,
    { status: 200, headers: { "Content-Type": "text/html; charset=utf-8" } }
  );
}
