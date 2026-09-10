import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { resolvePortalSlug } from "@/lib/portal/company";
import { verifyMessagingPreferencesToken } from "@/lib/marketing/unsubscribe";
import { optOutCustomerMarketingEmail } from "@/lib/marketing/opt-out";
import { getCustomerBaseUrl } from "@/lib/company/customer-url";

function htmlPage(status: number, title: string, body: string) {
  return new NextResponse(
    `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${title}</title>
</head>
<body style="margin:0;padding:40px 20px;font-family:Arial,Helvetica,sans-serif;background:#f8fafc;color:#0f172a">
  <div style="max-width:32rem;margin:0 auto;background:#fff;border:1px solid #e2e8f0;border-radius:12px;padding:28px 24px;text-align:center">
    ${body}
  </div>
</body>
</html>`,
    { status, headers: { "Content-Type": "text/html; charset=utf-8" } }
  );
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

async function handleUnsubscribe(request: NextRequest) {
  const token = request.nextUrl.searchParams.get("token") ?? "";
  const verified = verifyMessagingPreferencesToken(token);
  if (!verified) {
    return htmlPage(
      400,
      "Invalid link",
      `<h1 style="margin:0 0 12px;font-size:1.4rem">Invalid or expired link</h1>
       <p style="margin:0;color:#475569">This unsubscribe link is not valid. Contact us if you need help.</p>`
    );
  }

  const customer = await prisma.customer.findFirst({
    where: { id: verified.customerId, companyId: verified.companyId },
    select: {
      id: true,
      marketingEmailOptOut: true,
      company: { select: { name: true, portalSlug: true, bookingSlug: true, customerBaseUrl: true } },
    },
  });
  if (!customer) {
    return htmlPage(
      404,
      "Not found",
      `<h1 style="margin:0 0 12px;font-size:1.4rem">Customer not found</h1>
       <p style="margin:0;color:#475569">Please contact the company to update your messaging preferences.</p>`
    );
  }

  await optOutCustomerMarketingEmail({
    customerId: verified.customerId,
    companyId: verified.companyId,
    unenrollAllCampaigns: true,
  });

  const slug = resolvePortalSlug(customer.company);
  const prefsUrl = slug
    ? `${getCustomerBaseUrl(customer.company)}/portal/${slug}/preferences?token=${encodeURIComponent(token)}`
    : null;
  const companyName = escapeHtml(customer.company.name);

  return htmlPage(
    200,
    "Unsubscribed",
    `<h1 style="margin:0 0 12px;font-size:1.4rem">You are unsubscribed</h1>
     <p style="margin:0 0 12px;color:#475569">
       ${companyName} will no longer send you marketing emails. You have also been removed from current campaigns.
     </p>
     <p style="margin:0 0 16px;color:#475569;font-size:14px">
       Appointment reminders are unchanged unless you update them in preferences.
     </p>
     ${
       prefsUrl
         ? `<p style="margin:0"><a href="${escapeHtml(prefsUrl)}" style="color:#4C9BC8">Manage other messaging preferences</a></p>`
         : ""
     }`
  );
}

/** One-click marketing email unsubscribe. */
export async function GET(request: NextRequest) {
  return handleUnsubscribe(request);
}

export async function POST(request: NextRequest) {
  return handleUnsubscribe(request);
}
