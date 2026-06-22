import { NextRequest, NextResponse } from "next/server";
import { badRequestResponse, requireSessionUser, unauthorizedResponse } from "@/lib/api-auth";
import { fetchGbpPerformance, getCompanyAccessToken } from "@/lib/google-business/client";
import { prisma } from "@/lib/prisma";

export async function GET(request: NextRequest) {
  try {
    const user = await requireSessionUser();
    const daysParam = Number(request.nextUrl.searchParams.get("days") ?? "28");
    const days = Number.isFinite(daysParam) ? Math.min(90, Math.max(7, daysParam)) : 28;

    const company = await prisma.company.findUnique({
      where: { id: user.companyId },
      select: {
        googleBusinessLocationId: true,
        googleBusinessLocationTitle: true,
      },
    });

    if (!company?.googleBusinessLocationId) {
      return badRequestResponse("Select a Google Business Profile location first");
    }

    const accessToken = await getCompanyAccessToken(user.companyId);
    const summary = await fetchGbpPerformance(
      accessToken,
      company.googleBusinessLocationId,
      company.googleBusinessLocationTitle ?? company.googleBusinessLocationId,
      days
    );

    return NextResponse.json(summary);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to load performance";
    const status = err && typeof err === "object" && "status" in err ? Number(err.status) : 500;
    return NextResponse.json({ error: message }, { status: status || 500 });
  }
}
