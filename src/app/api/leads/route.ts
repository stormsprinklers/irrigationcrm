import { NextRequest, NextResponse } from "next/server";
import { LeadStatus } from "@prisma/client";
import { badRequestResponse, requireSessionUser, unauthorizedResponse } from "@/lib/api-auth";
import { listLeads, serializeLead } from "@/lib/leads/queries";
import { leadInclude } from "@/lib/leads/queries";
import { prisma } from "@/lib/prisma";

export async function GET(request: NextRequest) {
  try {
    const user = await requireSessionUser();
    const { searchParams } = request.nextUrl;
    const search = searchParams.get("search") ?? undefined;
    const statusParam = searchParams.get("status");
    const status =
      statusParam && Object.values(LeadStatus).includes(statusParam as LeadStatus)
        ? (statusParam as LeadStatus)
        : undefined;

    const leads = await listLeads(user.companyId, { search, status });
    return NextResponse.json({ leads });
  } catch {
    return unauthorizedResponse();
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await requireSessionUser();
    const body = await request.json();
    if (!body.name) return badRequestResponse("name is required");

    const lead = await prisma.lead.create({
      data: {
        companyId: user.companyId,
        name: String(body.name),
        phone: body.phone ?? null,
        email: body.email ?? null,
        source: body.source ?? null,
        status: (body.status as LeadStatus) ?? LeadStatus.NEW,
        assignedUserId: body.assignedUserId ?? null,
        notes: body.notes ?? null,
      },
      include: leadInclude,
    });

    return NextResponse.json(serializeLead(lead), { status: 201 });
  } catch {
    return unauthorizedResponse();
  }
}
