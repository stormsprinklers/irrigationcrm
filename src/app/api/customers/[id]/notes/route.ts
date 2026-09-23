import { NextRequest, NextResponse } from "next/server";
import { badRequestResponse, requireSessionUser, unauthorizedResponse } from "@/lib/api-auth";
import { prisma } from "@/lib/prisma";

type Params = { params: Promise<{ id: string }> };

export async function GET(_request: NextRequest, { params }: Params) {
  try {
    const user = await requireSessionUser();
    const { id } = await params;
    const notes = await prisma.customerNote.findMany({
      where: { customerId: id, customer: { companyId: user.companyId } },
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
    const customer = await prisma.customer.findFirst({
      where: { id, companyId: user.companyId },
    });
    if (!customer) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const body = await request.json();
    if (!body.body?.trim()) return badRequestResponse("Note body is required");

    const note = await prisma.customerNote.create({
      data: { customerId: id, authorId: user.id, body: body.body.trim() },
      include: { author: { select: { id: true, name: true, photoUrl: true, color: true } } },
    });

    return NextResponse.json(note, { status: 201 });
  } catch {
    return unauthorizedResponse();
  }
}

export async function PATCH(request: NextRequest, { params }: Params) {
  try {
    const user = await requireSessionUser();
    const { id } = await params;
    const body = await request.json().catch(() => ({}));
    const noteId = typeof body.noteId === "string" ? body.noteId : "";
    const noteBody = typeof body.body === "string" ? body.body.trim() : "";
    if (!noteId) return badRequestResponse("Note id is required");
    if (!noteBody) return badRequestResponse("Note body is required");

    const note = await prisma.customerNote.findFirst({
      where: { id: noteId, customerId: id, customer: { companyId: user.companyId } },
    });
    if (!note) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const updated = await prisma.customerNote.update({
      where: { id: note.id },
      data: { body: noteBody },
      include: { author: { select: { id: true, name: true, photoUrl: true, color: true } } },
    });
    return NextResponse.json(updated);
  } catch {
    return unauthorizedResponse();
  }
}

export async function DELETE(request: NextRequest, { params }: Params) {
  try {
    const user = await requireSessionUser();
    const { id } = await params;
    const noteId = request.nextUrl.searchParams.get("noteId");
    if (!noteId) return badRequestResponse("Note id is required");

    const result = await prisma.customerNote.deleteMany({
      where: { id: noteId, customerId: id, customer: { companyId: user.companyId } },
    });
    if (result.count === 0) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    return NextResponse.json({ ok: true });
  } catch {
    return unauthorizedResponse();
  }
}
