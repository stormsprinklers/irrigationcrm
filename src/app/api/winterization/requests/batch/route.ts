import { NextRequest, NextResponse } from "next/server";
import { requireSessionUser, unauthorizedResponse } from "@/lib/api-auth";
import { prisma } from "@/lib/prisma";
import { irrigationFeaturesEnabled } from "@/lib/company/features";
import { canViewWinterizationNav } from "@/lib/settings/access";
import {
  removeWinterizationRequests,
  scheduleWinterizationRequests,
} from "@/lib/winterization/actions";

export async function POST(request: NextRequest) {
  try {
    const user = await requireSessionUser();
    const company = await prisma.company.findUnique({
      where: { id: user.companyId },
      select: { irrigationFeaturesEnabled: true },
    });
    if (!irrigationFeaturesEnabled(company) || !canViewWinterizationNav(user.role)) {
      return NextResponse.json({ error: "Winterization tools are off" }, { status: 403 });
    }

    let body: Record<string, unknown> = {};
    try {
      body = (await request.json()) as Record<string, unknown>;
    } catch {
      return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
    }

    const action = String(body.action ?? "");
    const ids = Array.isArray(body.ids)
      ? body.ids.map((id) => String(id).trim()).filter(Boolean)
      : [];
    if (!ids.length) {
      return NextResponse.json({ error: "Select at least one customer" }, { status: 400 });
    }
    if (ids.length > 200) {
      return NextResponse.json({ error: "Too many selected" }, { status: 400 });
    }

    try {
      if (action === "schedule") {
        const scheduledDate = typeof body.scheduledDate === "string" ? body.scheduledDate.trim() : "";
        const result = await scheduleWinterizationRequests(user.companyId, ids, scheduledDate);
        return NextResponse.json(result);
      }
      if (action === "remove") {
        const result = await removeWinterizationRequests(user.companyId, ids);
        return NextResponse.json(result);
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : "Could not update winterization list";
      return NextResponse.json({ error: message }, { status: 400 });
    }

    return NextResponse.json({ error: "Invalid action" }, { status: 400 });
  } catch {
    return unauthorizedResponse();
  }
}
