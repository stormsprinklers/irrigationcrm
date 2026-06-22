import { NextResponse } from "next/server";
import { requireSessionUser, unauthorizedResponse } from "@/lib/api-auth";
import { listAudienceCities, listAudienceTags } from "@/lib/marketing/audience";

export async function GET() {
  try {
    const user = await requireSessionUser();
    const [cities, tags] = await Promise.all([
      listAudienceCities(user.companyId),
      listAudienceTags(user.companyId),
    ]);
    return NextResponse.json({ cities, tags });
  } catch {
    return unauthorizedResponse();
  }
}
