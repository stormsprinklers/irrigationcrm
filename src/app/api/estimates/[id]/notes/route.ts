import { NextRequest, NextResponse } from "next/server";
import { badRequestResponse, requireSessionUser, unauthorizedResponse } from "@/lib/api-auth";
import { getEstimateForCompany } from "@/lib/estimates/queries";
import { prisma } from "@/lib/prisma";

type Params = { params: Promise<{ id: string }> };

export async function GET(_request: NextRequest, { params }: Params) {
  try {
    const user = await requireSessionUser();
    const { id } = await params;
    const notes = await prisma.estimateNote.findMany({
      where: { estimateId: id, estimate: { companyId: user.companyId } },
      orderBy: { createdAt: "desc" },
    });

    const authorIds = [...new Set(notes.map((n) => n.authorId))];
    const authors = await prisma.user.findMany({
      where: { id: { in: authorIds } },
      select: { id: true, name: true, photoUrl: true, color: true },
    });
    const authorMap = new Map(authors.map((a) => [a.id, a]));

    return NextResponse.json(
      notes.map((note) => ({
        id: note.id,
        body: note.body,
        createdAt: note.createdAt.toISOString(),
        author: authorMap.get(note.authorId) ?? { id: note.authorId, name: "Unknown" },
      }))
    );
  } catch {
    return unauthorizedResponse();
  }
}

export async function POST(request: NextRequest, { params }: Params) {
  try {
    const user = await requireSessionUser();
    const { id } = await params;
    const estimate = await prisma.estimate.findFirst({ where: { id, companyId: user.companyId } });
    if (!estimate) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const body = await request.json();
    if (!body.body?.trim()) return badRequestResponse("Note body is required");

    await prisma.estimateNote.create({
      data: { estimateId: id, authorId: user.id, body: body.body.trim() },
    });

    const updated = await getEstimateForCompany(user.companyId, id);
    return NextResponse.json(updated, { status: 201 });
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

    const note = await prisma.estimateNote.findFirst({
      where: { id: noteId, estimateId: id, estimate: { companyId: user.companyId } },
    });
    if (!note) return NextResponse.json({ error: "Not found" }, { status: 404 });

    await prisma.estimateNote.update({
      where: { id: note.id },
      data: { body: noteBody },
    });
    const updated = await getEstimateForCompany(user.companyId, id);
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

    const result = await prisma.estimateNote.deleteMany({
      where: { id: noteId, estimateId: id, estimate: { companyId: user.companyId } },
    });
    if (result.count === 0) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    const updated = await getEstimateForCompany(user.companyId, id);
    return NextResponse.json(updated);
  } catch {
    return unauthorizedResponse();
  }
}
