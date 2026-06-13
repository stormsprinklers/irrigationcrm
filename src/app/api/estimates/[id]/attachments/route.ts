import { NextRequest, NextResponse } from "next/server";
import { badRequestResponse, requireSessionUser, unauthorizedResponse } from "@/lib/api-auth";
import { uploadPrivateBlob } from "@/lib/blob/storage";
import { prisma } from "@/lib/prisma";

type Params = { params: Promise<{ id: string }> };

const MAX_SIZE = 10 * 1024 * 1024;
const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif", "application/pdf"];

export async function GET(_request: NextRequest, { params }: Params) {
  try {
    const user = await requireSessionUser();
    const { id } = await params;
    const attachments = await prisma.estimateAttachment.findMany({
      where: { estimateId: id, estimate: { companyId: user.companyId } },
      orderBy: { createdAt: "desc" },
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
    const estimate = await prisma.estimate.findFirst({ where: { id, companyId: user.companyId } });
    if (!estimate) return NextResponse.json({ error: "Not found" }, { status: 404 });

    if (!process.env.BLOB_READ_WRITE_TOKEN) {
      return NextResponse.json({ error: "BLOB_READ_WRITE_TOKEN is not configured" }, { status: 503 });
    }

    const formData = await request.formData();
    const file = formData.get("file");
    if (!file || !(file instanceof File)) return badRequestResponse("File is required");
    if (!ALLOWED_TYPES.includes(file.type)) return badRequestResponse("Invalid file type");
    if (file.size > MAX_SIZE) return badRequestResponse("File must be under 10MB");

    const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
    const blob = await uploadPrivateBlob(
      `estimates/${estimate.companyId}/${id}/${Date.now()}-${safeName}`,
      file,
      { contentType: file.type }
    );

    const attachment = await prisma.estimateAttachment.create({
      data: {
        estimateId: id,
        blobUrl: blob.url,
        fileName: file.name,
        mimeType: file.type,
      },
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

    await prisma.estimateAttachment.deleteMany({
      where: { id: attachmentId, estimateId: id, estimate: { companyId: user.companyId } },
    });

    return NextResponse.json({ ok: true });
  } catch {
    return unauthorizedResponse();
  }
}
