import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { createReferralSubmission, getPublicReferralFormMeta } from "@/lib/referrals/submissions";

type Params = { params: Promise<{ slug: string; token: string }> };

async function resolveCompany(slug: string) {
  return prisma.company.findFirst({
    where: { portalSlug: slug, portalEnabled: true },
    select: { id: true, name: true },
  });
}

export async function GET(_request: NextRequest, { params }: Params) {
  const { slug, token } = await params;
  const company = await resolveCompany(slug);
  if (!company) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const meta = await getPublicReferralFormMeta({
    companyId: company.id,
    memberToken: token,
  });
  if (!meta) return NextResponse.json({ error: "Referral link is not valid" }, { status: 404 });

  return NextResponse.json(meta);
}

export async function POST(request: NextRequest, { params }: Params) {
  const { slug, token } = await params;
  const company = await resolveCompany(slug);
  if (!company) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const body = await request.json();
  const referredName = typeof body.name === "string" ? body.name : "";
  if (!referredName.trim()) {
    return NextResponse.json({ error: "Name is required" }, { status: 400 });
  }

  try {
    const result = await createReferralSubmission({
      companyId: company.id,
      memberToken: token,
      input: {
        referredName,
        referredPhone: typeof body.phone === "string" ? body.phone : null,
        referredEmail: typeof body.email === "string" ? body.email : null,
        referredAddress: typeof body.address === "string" ? body.address : null,
        referredCity: typeof body.city === "string" ? body.city : null,
        referredState: typeof body.state === "string" ? body.state : null,
        referredZip: typeof body.zip === "string" ? body.zip : null,
      },
    });

    return NextResponse.json({
      ok: true,
      submissionId: result.submission.id,
      leadId: result.lead.id,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not submit referral";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
