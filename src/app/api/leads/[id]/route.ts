import { NextRequest, NextResponse } from "next/server";
import { LeadStatus } from "@prisma/client";
import { badRequestResponse, requireSessionUser, unauthorizedResponse } from "@/lib/api-auth";
import { leadStatusUpdateData } from "@/lib/leads/contact-status";
import { convertLeadToCustomer, serializeLead } from "@/lib/leads/queries";
import { leadInclude } from "@/lib/leads/queries";
import { prisma } from "@/lib/prisma";

type RouteParams = { params: Promise<{ id: string }> };

export async function PATCH(request: NextRequest, { params }: RouteParams) {
  try {
    const user = await requireSessionUser();
    const { id } = await params;
    const body = await request.json();

    const existing = await prisma.lead.findFirst({ where: { id, companyId: user.companyId } });
    if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const nextStatus =
      body.status !== undefined && Object.values(LeadStatus).includes(body.status as LeadStatus)
        ? (body.status as LeadStatus)
        : undefined;

    const lead = await prisma.lead.update({
      where: { id },
      data: {
        ...(body.name !== undefined ? { name: String(body.name) } : {}),
        ...(body.phone !== undefined ? { phone: body.phone } : {}),
        ...(body.email !== undefined ? { email: body.email } : {}),
        ...(body.source !== undefined ? { source: body.source } : {}),
        ...(body.notes !== undefined ? { notes: body.notes } : {}),
        ...(body.assignedUserId !== undefined ? { assignedUserId: body.assignedUserId } : {}),
        ...(nextStatus !== undefined
          ? leadStatusUpdateData(
              { status: existing.status, contactedAt: existing.contactedAt },
              nextStatus
            )
          : {}),
      },
      include: leadInclude,
    });

    return NextResponse.json(serializeLead(lead));
  } catch {
    return unauthorizedResponse();
  }
}

export async function DELETE(_request: NextRequest, { params }: RouteParams) {
  try {
    const user = await requireSessionUser();
    const { id } = await params;
    const existing = await prisma.lead.findFirst({ where: { id, companyId: user.companyId } });
    if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });
    await prisma.lead.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch {
    return unauthorizedResponse();
  }
}

export async function POST(request: NextRequest, { params }: RouteParams) {
  try {
    const user = await requireSessionUser();
    const { id } = await params;
    const body = await request.json();

    if (body.action !== "convert") return badRequestResponse("Unknown action");

    const customer = await convertLeadToCustomer(user.companyId, id);
    if (!customer) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const lead = await prisma.lead.findFirst({
      where: { id, companyId: user.companyId },
      include: leadInclude,
    });

    return NextResponse.json({ customer, lead: lead ? serializeLead(lead) : null });
  } catch {
    return unauthorizedResponse();
  }
}
