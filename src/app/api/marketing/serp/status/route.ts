import { NextResponse } from "next/server";
import { requireSessionUser, unauthorizedResponse } from "@/lib/api-auth";
import { getSerpQuotaStatus } from "@/lib/local-seo/rankings-service";

export async function GET() {
  try {
    await requireSessionUser();
    return NextResponse.json(await getSerpQuotaStatus());
  } catch {
    return unauthorizedResponse();
  }
}
