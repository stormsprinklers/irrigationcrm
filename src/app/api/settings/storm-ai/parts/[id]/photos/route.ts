import { NextRequest, NextResponse } from "next/server";
import {
  badRequestResponse,
  requireSessionUser,
  unauthorizedResponse,
} from "@/lib/api-auth";
import { uploadPrivateBlob } from "@/lib/blob/storage";
import { serializePartPhoto } from "@/lib/storm-ai/parts-info";
import { prisma } from "@/lib/prisma";

function forbid(role: string) {
  return role !== "ADMIN" && role !== "MANAGER";
}

type Params = { params: Promise<{ id: string }> };

const MAX_SIZE = 12 * 1024 * 1024;
const ALLOWED = ["image/jpeg", "image/png", "image/webp", "image/gif"];

export async function POST(request: NextRequest, { params }: Params) {
  try {
    const user = await requireSessionUser();
    if (forbid(user.role)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    const { id } = await params;
    const part = await prisma.techAssistPart.findFirst({
      where: { id, companyId: user.companyId },
    });
    if (!part) return NextResponse.json({ error: "Not found" }, { status: 404 });

    if (!process.env.BLOB_READ_WRITE_TOKEN) {
      return NextResponse.json({ error: "BLOB_READ_WRITE_TOKEN is not configured" }, { status: 503 });
    }

    const formData = await request.formData();
    const file = formData.get("file");
    if (!file || !(file instanceof File)) return badRequestResponse("File is required");
    if (!ALLOWED.includes(file.type)) return badRequestResponse("Photos must be JPEG, PNG, WebP, or GIF");
    if (file.size > MAX_SIZE) return badRequestResponse("Photo must be under 12MB");

    const alt =
      typeof formData.get("alt") === "string" ? String(formData.get("alt")).trim() || null : null;
    const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
    const blob = await uploadPrivateBlob(
      `parts-info/${user.companyId}/${id}/${Date.now()}-${safeName}`,
      file,
      { contentType: file.type }
    );

    const pathname =
      "pathname" in blob && typeof blob.pathname === "string"
        ? blob.pathname
        : blob.url.replace(/^https?:\/\/[^/]+\//, "");
    const count = await prisma.techAssistPartPhoto.count({ where: { partId: id } });
    const photo = await prisma.techAssistPartPhoto.create({
      data: {
        partId: id,
        blobUrl: blob.url,
        pathname,
        fileName: file.name,
        mimeType: file.type,
        alt,
        sortOrder: count,
      },
    });

    return NextResponse.json(serializePartPhoto(photo), { status: 201 });
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return unauthorizedResponse();
    }
    console.error("Parts photo upload error:", error);
    return NextResponse.json({ error: "Upload failed" }, { status: 500 });
  }
}
