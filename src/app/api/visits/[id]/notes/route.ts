import { NextRequest, NextResponse } from "next/server";
import { badRequestResponse, requireSessionUser, unauthorizedResponse } from "@/lib/api-auth";
import { prisma } from "@/lib/prisma";
import { getVisitForCompany } from "@/lib/visits/queries";

type Params = { params: Promise<{ id: string }> };

export async function GET(_request: NextRequest, { params }: Params) {
  try {
    const user = await requireSessionUser();
    const { id } = await params;
    const notes = await prisma.visitNote.findMany({
      where: { visitId: id, visit: { companyId: user.companyId } },
      orderBy: { createdAt: "desc" },
      include: { author: { select: { id: true, name: true, photoUrl: true, color: true } } },
    });
    return NextResponse.json(notes);
  } catch {
    return unauthorizedResponse();
  }
}

export async function POST(request: NextRequest, { params }: Params) {
  try {
    const user = await requireSessionUser();
    const { id } = await params;
    const visit = await prisma.visit.findFirst({ where: { id, companyId: user.companyId } });
    if (!visit) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const body = await request.json();
    if (!body.body?.trim()) return badRequestResponse("Note body is required");

    const note = await prisma.visitNote.create({
      data: { visitId: id, authorId: user.id, body: body.body.trim() },
      include: { author: { select: { id: true, name: true, photoUrl: true, color: true } } },
    });

    return NextResponse.json(note, { status: 201 });
  } catch {
    return unauthorizedResponse();
  }
}
