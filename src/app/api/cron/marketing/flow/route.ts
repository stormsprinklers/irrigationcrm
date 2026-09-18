import { NextRequest, NextResponse } from "next/server";
import { processFlowEnrollments } from "@/lib/marketing/flow-engine";

export const maxDuration = 60;

/** Keep short campaign waits responsive without repeating trigger and blast work. */
export async function GET(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;

  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const flow = await processFlowEnrollments({ maxRunMs: 45_000 });
    return NextResponse.json({ ok: true, flow });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Campaign flow processing failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
