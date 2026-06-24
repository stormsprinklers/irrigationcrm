import { NextRequest, NextResponse } from "next/server";
import { requireSessionUser, unauthorizedResponse } from "@/lib/api-auth";
import { lookupCustomerByPhone } from "@/lib/voice/caller-lookup";

export async function GET(request: NextRequest) {
  try {
    const user = await requireSessionUser();
    const phone = request.nextUrl.searchParams.get("phone");
    if (!phone) {
      return NextResponse.json({ error: "phone required" }, { status: 400 });
    }

    const result = await lookupCustomerByPhone(user.companyId, phone);
    return NextResponse.json(result);
  } catch {
    return unauthorizedResponse();
  }
}
