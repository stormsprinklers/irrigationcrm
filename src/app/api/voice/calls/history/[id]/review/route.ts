import { NextResponse } from "next/server";
import { requireSessionUser, unauthorizedResponse } from "@/lib/api-auth";
import { markMissedCallReviewed } from "@/lib/voice/call-history-queries";

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requireSessionUser();
    const { id } = await params;
    const ok = await markMissedCallReviewed(user.companyId, id);
    if (!ok) return NextResponse.json({ error: "Call not found" }, { status: 404 });
    return NextResponse.json({ ok: true });
  } catch {
    return unauthorizedResponse();
  }
}
