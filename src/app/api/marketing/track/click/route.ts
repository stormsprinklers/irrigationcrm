import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(request: NextRequest) {
  const recipientId = request.nextUrl.searchParams.get("r");
  const encodedUrl = request.nextUrl.searchParams.get("u");

  if (!recipientId || !encodedUrl) {
    return NextResponse.redirect(new URL("/", request.url));
  }

  let targetUrl: string;
  try {
    targetUrl = decodeURIComponent(encodedUrl);
  } catch {
    return NextResponse.redirect(new URL("/", request.url));
  }

  const recipient = await prisma.campaignRecipient.findUnique({
    where: { id: recipientId },
  });
  if (!recipient) {
    return NextResponse.redirect(targetUrl);
  }

  await prisma.campaignRecipient.update({
    where: { id: recipientId },
    data: {
      clickCount: { increment: 1 },
      clickedAt: recipient.clickedAt ?? new Date(),
    },
  });

  const all = await prisma.campaignRecipient.findMany({
    where: { campaignId: recipient.campaignId },
    select: { status: true, openedAt: true, clickCount: true },
  });
  const { buildCampaignStats } = await import("@/lib/marketing/stats");
  const stats = buildCampaignStats(all);
  await prisma.campaign.update({
    where: { id: recipient.campaignId },
    data: { statsJson: stats },
  });

  return NextResponse.redirect(targetUrl);
}
