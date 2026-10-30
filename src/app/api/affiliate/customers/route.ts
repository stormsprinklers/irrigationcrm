import { NextRequest, NextResponse } from "next/server";
import {
  forbiddenResponse,
  requireSessionUser,
  unauthorizedResponse,
} from "@/lib/api-auth";
import {
  createAffiliateCustomer,
  parseAffiliateCustomerPayload,
} from "@/lib/affiliate/customers";

export async function POST(request: NextRequest) {
  try {
    const user = await requireSessionUser(request);
    if (user.role !== "AFFILIATE") return forbiddenResponse();
    const parsed = parseAffiliateCustomerPayload(await request.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Validation failed", details: parsed.error.flatten().fieldErrors },
        { status: 400 }
      );
    }
    const customer = await createAffiliateCustomer({
      companyId: user.companyId,
      affiliateUserId: user.id,
      input: { ...parsed.data, dryRun: false },
    });
    return NextResponse.json({ customer }, { status: 201 });
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") return unauthorizedResponse();
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Could not add customer" },
      { status: 500 }
    );
  }
}
