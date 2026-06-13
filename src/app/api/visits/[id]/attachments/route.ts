import { NextRequest, NextResponse } from "next/server";
import { put } from "@vercel/blob";
import { badRequestResponse, requireSessionUser, unauthorizedResponse } from "@/lib/api-auth";
import { prisma } from "@/lib/prisma";

type Params = { params: Promise<{ id: string }> };

const MAX_SIZE = 10 * 1024 * 1024;
const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif", "application/pdf"];

export async function GET(_request: NextRequest, { params }: Params) {
  try {
    const user = await requireSessionUser();
    const { id } = await params;
    const attachments = await prisma.visitAttachment.findMany({
      where: { visitId: id, visit: { companyId: user.companyId } },
      orderBy: { createdAt: "desc" },
      include: { uploadedBy: { select: { id: true, name: true } } },
    });
    return NextResponse.json(attachments);
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

    if (!process.env.BLOB_READ_WRITE_TOKEN) {
      return NextResponse.json({ error: "BLOB_READ_WRITE_TOKEN is not configured" }, { status: 503 });
    }

    const formData = await request.formData();
    const file = formData.get("file");
    if (!file || !(file instanceof File)) return badRequestResponse("File is required");
    if (!ALLOWED_TYPES.includes(file.type)) return badRequestResponse("Invalid file type");
    if (file.size > MAX_SIZE) return badRequestResponse("File must be under 10MB");

    const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
    const blob = await put(`visits/${visit.companyId}/${id}/${Date.now()}-${safeName}`, file, {
      access: "public",
      token: process.env.BLOB_READ_WRITE_TOKEN,
    });

    const attachment = await prisma.visitAttachment.create({
      data: {
        visitId: id,
        uploadedById: user.id,
        blobUrl: blob.url,
        fileName: file.name,
        mimeType: file.type,
      },
      include: { uploadedBy: { select: { id: true, name: true } } },
    });

    return NextResponse.json(attachment, { status: 201 });
  } catch {
    return unauthorizedResponse();
  }
}

export async function DELETE(request: NextRequest, { params }: Params) {
  try {
    const user = await requireSessionUser();
    const { id } = await params;
    const attachmentId = request.nextUrl.searchParams.get("attachmentId");
    if (!attachmentId) return badRequestResponse("attachmentId required");

    await prisma.visitAttachment.deleteMany({
      where: { id: attachmentId, visitId: id, visit: { companyId: user.companyId } },
    });

    return NextResponse.json({ ok: true });
  } catch {
    return unauthorizedResponse();
  }
}
