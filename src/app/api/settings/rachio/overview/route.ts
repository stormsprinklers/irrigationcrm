import { NextResponse } from "next/server";
import { requireSessionUser, unauthorizedResponse } from "@/lib/api-auth";
import { getRachioOverview } from "@/lib/rachio/overview";
import { RachioApiError } from "@/lib/rachio/types";

export async function GET() {
  try {
    const user = await requireSessionUser();
    const overview = await getRachioOverview(user.companyId);
    return NextResponse.json(overview);
  } catch (error) {
    if (error instanceof RachioApiError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    return unauthorizedResponse();
  }
}
