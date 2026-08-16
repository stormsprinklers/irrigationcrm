import { NextRequest, NextResponse } from "next/server";
import { del } from "@vercel/blob";
import { requireSessionUser, unauthorizedResponse } from "@/lib/api-auth";
import { serializePart } from "@/lib/storm-ai/parts-info";
import { prisma } from "@/lib/prisma";

function forbid(role: string) {
  return role !== "ADMIN" && role !== "MANAGER";
}

type Params = { params: Promise<{ id: string }> };

export async function GET(_request: Request, { params }: Params) {
  try {
    const user = await requireSessionUser();
    if (forbid(user.role)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    const { id } = await params;
    const part = await prisma.techAssistPart.findFirst({
      where: { id, companyId: user.companyId },
      include: {
        section: { select: { id: true, name: true } },
        photos: { orderBy: { sortOrder: "asc" } },
      },
    });
    if (!part) return NextResponse.json({ error: "Not found" }, { status: 404 });
    return NextResponse.json(serializePart(part));
  } catch {
    return unauthorizedResponse();
  }
}

export async function PATCH(request: NextRequest, { params }: Params) {
  try {
    const user = await requireSessionUser();
    if (forbid(user.role)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    const { id } = await params;
    const existing = await prisma.techAssistPart.findFirst({
      where: { id, companyId: user.companyId },
    });
    if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const body = (await request.json()) as Record<string, unknown>;
    if (typeof body.sectionId === "string") {
      const section = await prisma.techAssistPartSection.findFirst({
        where: { id: body.sectionId, companyId: user.companyId },
      });
      if (!section) return NextResponse.json({ error: "Section not found" }, { status: 404 });
    }

    const clearManual = body.clearManual === true;

    const part = await prisma.techAssistPart.update({
      where: { id },
      data: {
        ...(typeof body.name === "string" ? { name: body.name.trim() || existing.name } : {}),
        ...(typeof body.sectionId === "string" ? { sectionId: body.sectionId } : {}),
        ...(body.manufacturer !== undefined
          ? {
              manufacturer:
                typeof body.manufacturer === "string" ? body.manufacturer.trim() || null : null,
            }
          : {}),
        ...(body.partNumber !== undefined
          ? {
              partNumber:
                typeof body.partNumber === "string" ? body.partNumber.trim() || null : null,
            }
          : {}),
        ...(body.visualDescription !== undefined
          ? {
              visualDescription:
                typeof body.visualDescription === "string"
                  ? body.visualDescription.trim() || null
                  : null,
            }
          : {}),
        ...(body.technicalDescription !== undefined
          ? {
              technicalDescription:
                typeof body.technicalDescription === "string"
                  ? body.technicalDescription.trim() || null
                  : null,
            }
          : {}),
        ...(typeof body.active === "boolean" ? { active: body.active } : {}),
        ...(typeof body.sortOrder === "number" ? { sortOrder: body.sortOrder } : {}),
        ...(clearManual
          ? { manualUrl: null, manualFileName: null, manualMimeType: null }
          : {}),
      },
      include: {
        section: { select: { id: true, name: true } },
        photos: { orderBy: { sortOrder: "asc" } },
      },
    });

    if (clearManual && existing.manualUrl && process.env.BLOB_READ_WRITE_TOKEN) {
      try {
        await del(existing.manualUrl, { token: process.env.BLOB_READ_WRITE_TOKEN });
      } catch {
        /* best-effort */
      }
    }

    return NextResponse.json(serializePart(part));
  } catch {
    return unauthorizedResponse();
  }
}

export async function DELETE(_request: Request, { params }: Params) {
  try {
    const user = await requireSessionUser();
    if (forbid(user.role)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    const { id } = await params;
    const existing = await prisma.techAssistPart.findFirst({
      where: { id, companyId: user.companyId },
      include: { photos: true },
    });
    if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

    await prisma.techAssistPart.delete({ where: { id } });

    if (process.env.BLOB_READ_WRITE_TOKEN) {
      const urls = [
        ...existing.photos.map((p) => p.blobUrl),
        ...(existing.manualUrl ? [existing.manualUrl] : []),
      ];
      for (const url of urls) {
        try {
          await del(url, { token: process.env.BLOB_READ_WRITE_TOKEN });
        } catch {
          /* best-effort */
        }
      }
    }

    return NextResponse.json({ ok: true });
  } catch {
    return unauthorizedResponse();
  }
}
