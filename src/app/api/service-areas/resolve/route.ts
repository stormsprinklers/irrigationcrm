import { NextRequest, NextResponse } from "next/server";
import { requireSessionUser, unauthorizedResponse } from "@/lib/api-auth";
import { resolveServiceAreaByZip } from "@/lib/service-areas";

export async function GET(request: NextRequest) {
  try {
    const user = await requireSessionUser();
    const zip = request.nextUrl.searchParams.get("zip");
    if (!zip) {
      return NextResponse.json({ serviceArea: null });
    }

    const serviceArea = await resolveServiceAreaByZip(user.companyId, zip);
    return NextResponse.json({ serviceArea });
  } catch {
    return unauthorizedResponse();
  }
}
