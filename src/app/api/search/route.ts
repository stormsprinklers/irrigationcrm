import { NextRequest, NextResponse } from "next/server";
import { requireSessionUser, unauthorizedResponse } from "@/lib/api-auth";
import { globalSearch } from "@/lib/search/global-search";

export async function GET(request: NextRequest) {
  try {
    const user = await requireSessionUser();
    const q = request.nextUrl.searchParams.get("q") ?? "";
    const result = await globalSearch(user.companyId, q, user);
    return NextResponse.json(result);
  } catch {
    return unauthorizedResponse();
  }
}
