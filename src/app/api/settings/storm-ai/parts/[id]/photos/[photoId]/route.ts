import { NextResponse } from "next/server";
import { del } from "@vercel/blob";
import { requireSessionUser, unauthorizedResponse } from "@/lib/api-auth";
import { prisma } from "@/lib/prisma";

function forbid(role: string) {
  return role !== "ADMIN" && role !== "MANAGER";
}

type Params = { params: Promise<{ id: string; photoId: string }> };

export async function DELETE(_request: Request, { params }: Params) {
  try {
    const user = await requireSessionUser();
    if (forbid(user.role)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    const { id, photoId } = await params;
    const photo = await prisma.techAssistPartPhoto.findFirst({
      where: {
        id: photoId,
        partId: id,
        part: { companyId: user.companyId },
      },
    });
    if (!photo) return NextResponse.json({ error: "Not found" }, { status: 404 });

    await prisma.techAssistPartPhoto.delete({ where: { id: photoId } });
    if (process.env.BLOB_READ_WRITE_TOKEN) {
      try {
        await del(photo.blobUrl, { token: process.env.BLOB_READ_WRITE_TOKEN });
      } catch {
        /* best-effort */
      }
    }
    return NextResponse.json({ ok: true });
  } catch {
    return unauthorizedResponse();
  }
}
