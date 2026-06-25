import { NextResponse } from "next/server";
import { requireSessionUser, unauthorizedResponse } from "@/lib/api-auth";
import { isSerpApiConfigured } from "@/lib/serpapi/client";

export async function GET() {
  try {
    await requireSessionUser();
    return NextResponse.json({
      configured: isSerpApiConfigured(),
      liveRankingsEnabled: false,
    });
  } catch {
    return unauthorizedResponse();
  }
}
