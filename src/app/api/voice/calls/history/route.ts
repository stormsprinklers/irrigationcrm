import { NextResponse } from "next/server";
import { requireSessionUser, unauthorizedResponse } from "@/lib/api-auth";
import { listCallHistory } from "@/lib/voice/call-history-queries";

export async function GET() {
  try {
    const user = await requireSessionUser();
    const calls = await listCallHistory(user.companyId);
    return NextResponse.json({ calls });
  } catch {
    return unauthorizedResponse();
  }
}
