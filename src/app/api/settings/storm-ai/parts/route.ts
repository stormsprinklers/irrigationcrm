import { NextRequest, NextResponse } from "next/server";
import { requireSessionUser, unauthorizedResponse } from "@/lib/api-auth";
import { serializePart } from "@/lib/storm-ai/parts-info";
import { prisma } from "@/lib/prisma";

function forbid(role: string) {
  return role !== "ADMIN" && role !== "MANAGER";
}

export async function GET(request: NextRequest) {
  try {
    const user = await requireSessionUser();
    if (forbid(user.role)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    const sectionId = request.nextUrl.searchParams.get("sectionId");
    const parts = await prisma.techAssistPart.findMany({
      where: {
        companyId: user.companyId,
        ...(sectionId ? { sectionId } : {}),
      },
      include: {
        section: { select: { id: true, name: true } },
        photos: { orderBy: { sortOrder: "asc" } },
      },
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    });
    return NextResponse.json({ parts: parts.map(serializePart) });
  } catch {
    return unauthorizedResponse();
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await requireSessionUser();
    if (forbid(user.role)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    const body = (await request.json()) as {
      sectionId?: string;
      name?: string;
      manufacturer?: string | null;
      partNumber?: string | null;
      visualDescription?: string | null;
      technicalDescription?: string | null;
    };
    const sectionId = body.sectionId?.trim();
    const name = body.name?.trim();
    if (!sectionId || !name) {
      return NextResponse.json({ error: "sectionId and name are required" }, { status: 400 });
    }
    const section = await prisma.techAssistPartSection.findFirst({
      where: { id: sectionId, companyId: user.companyId },
    });
    if (!section) return NextResponse.json({ error: "Section not found" }, { status: 404 });

    const count = await prisma.techAssistPart.count({ where: { sectionId } });
    const part = await prisma.techAssistPart.create({
      data: {
        companyId: user.companyId,
        sectionId,
        name,
        manufacturer: body.manufacturer?.trim() || null,
        partNumber: body.partNumber?.trim() || null,
        visualDescription: body.visualDescription?.trim() || null,
        technicalDescription: body.technicalDescription?.trim() || null,
        sortOrder: count,
      },
      include: {
        section: { select: { id: true, name: true } },
        photos: true,
      },
    });
    return NextResponse.json(serializePart(part), { status: 201 });
  } catch {
    return unauthorizedResponse();
  }
}
