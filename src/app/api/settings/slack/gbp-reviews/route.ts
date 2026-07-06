import { NextRequest, NextResponse } from "next/server";
import {
  forbiddenResponse,
  requireSessionUser,
  unauthorizedResponse,
} from "@/lib/api-auth";
import { sendUnsentGbpReviewsToSlack } from "@/lib/google-business/review-slack-notifier";
import { isSlackConfigured, slackConfigHints } from "@/lib/slack/config";
import { testSlackAuth } from "@/lib/slack/client";
import { prisma } from "@/lib/prisma";

export async function GET() {
  try {
    const user = await requireSessionUser();
    const company = await prisma.company.findUnique({
      where: { id: user.companyId },
      select: {
        slackGbpReviewsEnabled: true,
        slackGbpReviewsChannelId: true,
        googleBusinessRefreshToken: true,
        googleBusinessLocationTitle: true,
      },
    });

    if (!company) {
      return NextResponse.json({ error: "Company not found" }, { status: 404 });
    }

    const auth = await testSlackAuth();
    const deliveredCount = await prisma.gbpReviewSlackDelivery.count({
      where: { companyId: user.companyId },
    });

    return NextResponse.json({
      slackConfigured: isSlackConfigured(),
      slackAuthOk: auth.ok,
      slackTeam: auth.ok ? auth.team : null,
      envHints: slackConfigHints(),
      gbpConnected: Boolean(company.googleBusinessRefreshToken),
      locationTitle: company.googleBusinessLocationTitle,
      enabled: company.slackGbpReviewsEnabled,
      channelId: company.slackGbpReviewsChannelId,
      deliveredCount,
      hasDeliveryHistory: deliveredCount > 0,
      slackError: auth.ok ? null : auth.error,
    });
  } catch {
    return unauthorizedResponse();
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const user = await requireSessionUser();
    if (user.role !== "ADMIN" && user.role !== "MANAGER") {
      return forbiddenResponse();
    }

    const body = await request.json();
    const enabled = body.enabled === true;
    const channelId =
      typeof body.channelId === "string" ? body.channelId.trim() || null : undefined;

    const existing = await prisma.company.findUnique({
      where: { id: user.companyId },
      select: {
        slackGbpReviewsChannelId: true,
        googleBusinessRefreshToken: true,
      },
    });

    if (!existing) {
      return NextResponse.json({ error: "Company not found" }, { status: 404 });
    }

    if (enabled && !isSlackConfigured()) {
      return NextResponse.json(
        { error: "Set SLACK_BOT_TOKEN in Vercel before enabling Slack review alerts." },
        { status: 400 }
      );
    }

    if (enabled && !existing.googleBusinessRefreshToken) {
      return NextResponse.json(
        { error: "Connect Google Business Profile before enabling Slack review alerts." },
        { status: 400 }
      );
    }

    const nextChannelId =
      channelId !== undefined ? channelId : existing.slackGbpReviewsChannelId;
    if (enabled && !nextChannelId) {
      return NextResponse.json(
        { error: "Slack channel ID is required when enabling review alerts." },
        { status: 400 }
      );
    }

    const company = await prisma.company.update({
      where: { id: user.companyId },
      data: {
        slackGbpReviewsEnabled: enabled,
        ...(channelId !== undefined ? { slackGbpReviewsChannelId: channelId } : {}),
      },
      select: {
        slackGbpReviewsEnabled: true,
        slackGbpReviewsChannelId: true,
      },
    });

    return NextResponse.json(company);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to save Slack settings";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST() {
  try {
    const user = await requireSessionUser();
    if (user.role !== "ADMIN" && user.role !== "MANAGER") {
      return forbiddenResponse();
    }

    const result = await sendUnsentGbpReviewsToSlack(user.companyId);
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to send reviews to Slack";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
