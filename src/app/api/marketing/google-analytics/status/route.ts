import { NextResponse } from "next/server";
import { requireSessionUser, unauthorizedResponse } from "@/lib/api-auth";
import { getGa4ConnectionStatus } from "@/lib/google-analytics/client";

export async function GET() {
  try {
    const user = await requireSessionUser();
    const status = await getGa4ConnectionStatus(user.companyId);
    if (!status) return NextResponse.json({ error: "Not found" }, { status: 404 });
    return NextResponse.json(status);
  } catch {
    return unauthorizedResponse();
  }
}
