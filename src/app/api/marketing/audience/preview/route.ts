import { NextRequest, NextResponse } from "next/server";
import { CampaignChannel } from "@prisma/client";
import { badRequestResponse, requireSessionUser, unauthorizedResponse } from "@/lib/api-auth";
import { previewAudience } from "@/lib/marketing/audience";
import type { AudienceFilters } from "@/lib/marketing/types";

export async function POST(request: NextRequest) {
  try {
    const user = await requireSessionUser();
    const body = await request.json();
    const channel = body.channel as CampaignChannel;
    const filters = body.filters as AudienceFilters | undefined;

    if (!channel || !Object.values(CampaignChannel).includes(channel)) {
      return badRequestResponse("Valid channel is required");
    }

    const result = await previewAudience(user.companyId, channel, filters ?? null);
    return NextResponse.json(result);
  } catch {
    return unauthorizedResponse();
  }
}
