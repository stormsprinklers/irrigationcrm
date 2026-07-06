import { NextResponse } from "next/server";
import { requireSessionUser, unauthorizedResponse } from "@/lib/api-auth";
import { getMetaAdsConnectionStatus } from "@/lib/meta/ads";

export async function GET() {
  try {
    const user = await requireSessionUser();
    const status = await getMetaAdsConnectionStatus(user.companyId);
    return NextResponse.json(status);
  } catch {
    return unauthorizedResponse();
  }
}
