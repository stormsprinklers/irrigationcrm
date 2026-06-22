import { NextRequest, NextResponse } from "next/server";
import { badRequestResponse, requireSessionUser, unauthorizedResponse } from "@/lib/api-auth";
import { generateCampaignEmail } from "@/lib/marketing/email-ai";
import { prisma } from "@/lib/prisma";

export async function POST(request: NextRequest) {
  try {
    const user = await requireSessionUser();
    const body = await request.json();
    const { prompt, subject, ctaUrl } = body;

    if (!prompt?.trim()) {
      return badRequestResponse("prompt is required");
    }

    const company = await prisma.company.findUnique({
      where: { id: user.companyId },
      select: { name: true },
    });
    if (!company) {
      return NextResponse.json({ error: "Company not found" }, { status: 404 });
    }

    const result = await generateCampaignEmail({
      prompt: String(prompt),
      subject: subject ? String(subject) : undefined,
      companyName: company.name,
      ctaUrl: ctaUrl ? String(ctaUrl) : undefined,
    });

    return NextResponse.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Generation failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
