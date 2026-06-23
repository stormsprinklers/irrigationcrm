import { NextRequest, NextResponse } from "next/server";
import { getCompanyByPortalSlug } from "@/lib/portal/company";
import { findCustomersByEmail, requestPortalLoginLink } from "@/lib/portal/login";

export async function POST(request: NextRequest) {
  const body = await request.json();
  const { slug, email, customerId } = body as {
    slug?: string;
    email?: string;
    customerId?: string;
  };

  if (!slug || !email) {
    return NextResponse.json({ error: "slug and email are required" }, { status: 400 });
  }

  const company = await getCompanyByPortalSlug(slug);
  if (!company) {
    return NextResponse.json({ error: "Portal not available" }, { status: 404 });
  }

  const customers = await findCustomersByEmail(company.id, email);
  if (!customers.length) {
    // Avoid email enumeration — always return success
    return NextResponse.json({ ok: true });
  }

  let targetId = customerId;
  if (!targetId) {
    if (customers.length > 1) {
      return NextResponse.json({
        ok: false,
        multiple: true,
        customers: customers.map((c) => ({ id: c.id, name: c.name })),
      });
    }
    targetId = customers[0].id;
  }

  const target = customers.find((c) => c.id === targetId);
  if (!target) {
    return NextResponse.json({ ok: true });
  }

  try {
    const result = await requestPortalLoginLink({
      companyId: company.id,
      companyName: company.name,
      slug,
      customerId: target.id,
      email,
      sendgridFrom: company.sendgridFrom,
      emailSenderName: company.emailSenderName,
      emailLogoUrl: company.emailLogoUrl,
    });

    return NextResponse.json({
      ok: true,
      sent: result.sent,
      ...(result.loginUrl ? { devLoginUrl: result.loginUrl } : {}),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to send login link";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
