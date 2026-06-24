import { NextRequest, NextResponse } from "next/server";
import { processDueSocialPosts } from "@/lib/marketing/social-publish";

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;

  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const result = await processDueSocialPosts();
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Social publish failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
