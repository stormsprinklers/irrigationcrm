import { NextResponse } from "next/server";
import { requireSessionUser, unauthorizedResponse } from "@/lib/api-auth";
import { listCompanyDevices } from "@/lib/rachio/client";
import { RachioApiError } from "@/lib/rachio/types";

export async function GET() {
  try {
    const user = await requireSessionUser();
    const devices = await listCompanyDevices(user.companyId);
    return NextResponse.json({ devices });
  } catch (error) {
    if (error instanceof RachioApiError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    return unauthorizedResponse();
  }
}
