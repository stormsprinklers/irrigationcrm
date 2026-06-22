import { NextRequest, NextResponse } from "next/server";
import { requireSessionUser, unauthorizedResponse } from "@/lib/api-auth";
import { getGbpConnectionStatus } from "@/lib/google-business/client";

export async function GET() {
  try {
    const user = await requireSessionUser();
    const status = await getGbpConnectionStatus(user.companyId);
    if (!status) return NextResponse.json({ error: "Not found" }, { status: 404 });
    return NextResponse.json(status);
  } catch {
    return unauthorizedResponse();
  }
}
