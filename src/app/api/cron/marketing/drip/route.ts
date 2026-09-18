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
    // This already deployed route is called every minute. Keep the expensive
    // trigger, legacy, and blast work at its previous five-minute cadence.
    const fullRun = new Date().getUTCMinutes() % 5 === 0;
    const triggers = fullRun ? await processCampaignTriggers() : null;
    const flow = await processFlowEnrollments(fullRun ? undefined : { maxRunMs: 45_000 });
    const legacy = fullRun ? await processDripSends() : null;
    const blast = fullRun ? await processPendingBlastSends() : null;
    return NextResponse.json({ ok: true, mode: fullRun ? "full" : "flow", triggers, flow, legacy, blast });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Drip processing failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
