import { NextRequest, NextResponse } from "next/server";
import { processDueSocialPosts } from "@/lib/marketing/social-publish";
import { authorizeCronRequest } from "@/lib/security/trusted-request";

export async function GET(request: NextRequest) {
  const denied = authorizeCronRequest(request);
  if (denied) return denied;

  try {
    const result = await processDueSocialPosts();
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Social publish failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
