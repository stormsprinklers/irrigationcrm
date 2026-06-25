import { NextResponse } from "next/server";
import { requireSessionUser, unauthorizedResponse } from "@/lib/api-auth";
import {
  GoogleAnalyticsApiError,
  listGa4Properties,
} from "@/lib/google-analytics/client";

export async function GET() {
  try {
    const user = await requireSessionUser();
    const properties = await listGa4Properties(user.companyId);
    return NextResponse.json({ properties });
  } catch (error) {
    if (error instanceof GoogleAnalyticsApiError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    return unauthorizedResponse();
  }
}
