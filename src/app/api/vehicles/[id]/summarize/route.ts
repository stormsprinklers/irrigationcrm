import { NextRequest, NextResponse } from "next/server";
import {
  forbiddenResponse,
  requireSessionUser,
  unauthorizedResponse,
} from "@/lib/api-auth";
import { canContributeVehicles } from "@/lib/vehicles/permissions";
import { summarizeVehicle } from "@/lib/vehicles/summarize";

type Params = { params: Promise<{ id: string }> };

export async function POST(request: NextRequest, { params }: Params) {
  try {
    const user = await requireSessionUser();
    if (!canContributeVehicles(user.role)) return forbiddenResponse();
    const { id } = await params;

    let force = false;
    try {
      const body = await request.json();
      force = Boolean(body?.force);
    } catch {
      force = false;
    }

    const result = await summarizeVehicle(id, user.companyId, { force });
    if (!result.ok && result.skipped === "Vehicle not found") {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    if (!result.ok) {
      return NextResponse.json({ error: result.skipped ?? "Summary failed" }, { status: 400 });
    }

    return NextResponse.json({ summary: result.summary, skipped: result.skipped });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Summary failed";
    if (message.includes("Unauthorized") || message.includes("session")) {
      return unauthorizedResponse();
    }
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
