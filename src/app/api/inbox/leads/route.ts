import { NextResponse } from "next/server";
import { requireSessionUser, unauthorizedResponse } from "@/lib/api-auth";
import { listWebsiteLeadInboxItems } from "@/lib/inbox/website-lead-items";

export async function GET() {
  try {
    const user = await requireSessionUser();
    const items = await listWebsiteLeadInboxItems(user.companyId);
    return NextResponse.json({ items });
  } catch {
    return unauthorizedResponse();
  }
}
