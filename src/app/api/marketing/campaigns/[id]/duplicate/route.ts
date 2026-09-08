import { NextRequest, NextResponse } from "next/server";
import { requireSessionUser, unauthorizedResponse } from "@/lib/api-auth";
import { duplicateCampaign } from "@/lib/marketing/campaign-actions";

type Params = { params: Promise<{ id: string }> };

export async function POST(_request: NextRequest, { params }: Params) {
  try {
    const user = await requireSessionUser();
    const { id } = await params;
    const copy = await duplicateCampaign(user.companyId, id);
    if (!copy) return NextResponse.json({ error: "Not found" }, { status: 404 });
    return NextResponse.json(copy, { status: 201 });
  } catch {
    return unauthorizedResponse();
  }
}
