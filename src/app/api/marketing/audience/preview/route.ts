import { NextRequest, NextResponse } from "next/server";
import { CampaignChannel } from "@prisma/client";
import { badRequestResponse, requireSessionUser, unauthorizedResponse } from "@/lib/api-auth";
import {
  previewAudienceForChannels,
  queryAudienceCustomersForChannels,
} from "@/lib/marketing/audience";
import type { AudienceFilters } from "@/lib/marketing/types";

export async function POST(request: NextRequest) {
  try {
    const user = await requireSessionUser();
    const body = await request.json();
    const channel = body.channel as CampaignChannel;
    const requestedChannels = Array.isArray(body.channels) ? body.channels : [channel];
    const channels = Array.from(new Set(requestedChannels)) as CampaignChannel[];
    const filters = body.filters as AudienceFilters | undefined;
    const includeCustomers = Boolean(body.includeCustomers);

    if (
      channels.length === 0 ||
      channels.some((item) => !Object.values(CampaignChannel).includes(item))
    ) {
      return badRequestResponse("At least one valid channel is required");
    }

    if (includeCustomers) {
      const customers = await queryAudienceCustomersForChannels(
        user.companyId,
        channels,
        filters ?? null
      );
      return NextResponse.json({
        count: customers.length,
        sample: customers.slice(0, 10),
        customers,
      });
    }

    const result = await previewAudienceForChannels(user.companyId, channels, filters ?? null);
    return NextResponse.json(result);
  } catch {
    return unauthorizedResponse();
  }
}
