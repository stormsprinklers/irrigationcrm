import { NextResponse } from "next/server";
import { requireSessionUser } from "@/lib/api-auth";
import { getRachioOverview } from "@/lib/rachio/overview";
import { RachioApiError } from "@/lib/rachio/types";

export async function GET() {
  try {
    const user = await requireSessionUser();
    const overview = await getRachioOverview(user.companyId);
    return NextResponse.json(overview);
  } catch (error) {
    console.error("[rachio/overview]", error);
    if (error instanceof RachioApiError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    const message = error instanceof Error ? error.message : "Failed to load Rachio overview";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
