import { NextRequest, NextResponse } from "next/server";
import { requireSessionUser, unauthorizedResponse } from "@/lib/api-auth";
import { userOperatesCompany } from "@/lib/voice/operated-session";
import { lookupCustomerByPhone } from "@/lib/voice/caller-lookup";

export async function GET(request: NextRequest) {
  try {
    const user = await requireSessionUser();
    const phone = request.nextUrl.searchParams.get("phone");
    if (!phone) {
      return NextResponse.json({ error: "phone required" }, { status: 400 });
    }

    const requestedCompanyId = request.nextUrl.searchParams.get("companyId")?.trim() || null;
    const companyId =
      requestedCompanyId && (await userOperatesCompany(user, requestedCompanyId))
        ? requestedCompanyId
        : user.companyId;

    const result = await lookupCustomerByPhone(companyId, phone);
    return NextResponse.json(result);
  } catch {
    return unauthorizedResponse();
  }
}
