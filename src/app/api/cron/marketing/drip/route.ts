import { NextRequest, NextResponse } from "next/server";
import {
  processCampaignTriggers,
  processFlowEnrollments,
} from "@/lib/marketing/flow-engine";
import { processDripSends, processPendingBlastSends } from "@/lib/marketing/send";

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;

  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const triggers = await processCampaignTriggers();
    const flow = await processFlowEnrollments();
    // Keep legacy linear drip processor for campaigns that still only have CampaignStep rows
    // and no flow activity this run.
    const legacy = await processDripSends();
    const blast = await processPendingBlastSends();
    return NextResponse.json({ ok: true, triggers, flow, legacy, blast });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Drip processing failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
