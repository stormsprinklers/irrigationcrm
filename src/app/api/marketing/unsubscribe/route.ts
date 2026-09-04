import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { resolvePortalSlug } from "@/lib/portal/company";
import { verifyMessagingPreferencesToken } from "@/lib/marketing/unsubscribe";
import { getCustomerBaseUrl } from "@/lib/company/customer-url";

/** Legacy marketing unsubscribe URL — redirect to portal preferences. */
export async function GET(request: NextRequest) {
  const token = request.nextUrl.searchParams.get("token") ?? "";
  const verified = verifyMessagingPreferencesToken(token);
  if (!verified) {
    return new NextResponse(
      `<!DOCTYPE html><html><body style="font-family:Arial,sans-serif;padding:40px;text-align:center">
        <h1>Invalid or expired link</h1>
        <p>This preferences link is not valid. Contact us if you need help.</p>
      </body></html>`,
      { status: 400, headers: { "Content-Type": "text/html; charset=utf-8" } }
    );
  }

  const company = await prisma.company.findUnique({
    where: { id: verified.companyId },
    select: { portalSlug: true, bookingSlug: true, customerBaseUrl: true },
  });
  const slug = company ? resolvePortalSlug(company) : null;
  if (!slug) {
    return new NextResponse(
      `<!DOCTYPE html><html><body style="font-family:Arial,sans-serif;padding:40px;text-align:center">
        <h1>Preferences unavailable</h1>
        <p>Please contact the company to update your messaging preferences.</p>
      </body></html>`,
      { status: 404, headers: { "Content-Type": "text/html; charset=utf-8" } }
    );
  }

  const url = `${getCustomerBaseUrl(company)}/portal/${slug}/preferences?token=${encodeURIComponent(token)}`;
  return NextResponse.redirect(url);
}
