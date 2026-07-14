import { NextResponse } from "next/server";
import { forbiddenResponse, requireSessionUser, unauthorizedResponse } from "@/lib/api-auth";
import { migrateCareersIntoHiring } from "@/lib/hiring/migrate-careers";
import { canAccessHiring } from "@/lib/hiring/permissions";

export async function POST() {
  try {
    const user = await requireSessionUser();
    if (!canAccessHiring(user.role)) return forbiddenResponse();
    const summary = await migrateCareersIntoHiring(user.companyId);
    return NextResponse.json({ ok: true, summary });
  } catch {
    return unauthorizedResponse();
  }
}
