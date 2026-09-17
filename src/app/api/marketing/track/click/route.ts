import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { trackCampaignEngagement } from "@/lib/marketing/engagement";
import { safeTrackedDestination } from "@/lib/marketing/link-tracking";

export async function GET(request: NextRequest) {
  const recipientId = request.nextUrl.searchParams.get("r");
  const encodedUrl = request.nextUrl.searchParams.get("u");

  if (!recipientId || !encodedUrl) {
    return NextResponse.redirect(new URL("/", request.url));
  }

  const targetUrl = safeTrackedDestination(encodedUrl);
  if (!targetUrl) {
    return NextResponse.redirect(new URL("/", request.url));
  }

  const recipient = await prisma.campaignRecipient.findUnique({
    where: { id: recipientId },
    select: { id: true },
  });
  if (!recipient) {
    return NextResponse.redirect(new URL("/", request.url));
  }

  try {
    await trackCampaignEngagement({
      recipientId,
      kind: "clicked",
      clickUrl: targetUrl,
    });
  } catch (err) {
    console.error("Campaign click tracking failed", err);
  }

  return NextResponse.redirect(targetUrl);
}
