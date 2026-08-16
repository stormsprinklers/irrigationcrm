import { NextRequest, NextResponse } from "next/server";
import { del } from "@vercel/blob";
import {
  badRequestResponse,
  requireSessionUser,
  unauthorizedResponse,
} from "@/lib/api-auth";
import { uploadPrivateBlob } from "@/lib/blob/storage";
import { blobProxyUrl } from "@/lib/blob/urls";
import { prisma } from "@/lib/prisma";

function forbid(role: string) {
  return role !== "ADMIN" && role !== "MANAGER";
}

type Params = { params: Promise<{ id: string }> };

const MAX_SIZE = 25 * 1024 * 1024;
const ALLOWED = ["application/pdf"];

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
    if (!ALLOWED.includes(file.type)) return badRequestResponse("Manual must be a PDF");
    if (file.size > MAX_SIZE) return badRequestResponse("Manual must be under 25MB");

    const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
    const blob = await uploadPrivateBlob(
      `parts-info/${user.companyId}/${id}/manual-${Date.now()}-${safeName}`,
      file,
      { contentType: file.type }
    );

    const previousUrl = part.manualUrl;
    const updated = await prisma.techAssistPart.update({
      where: { id },
      data: {
        manualUrl: blob.url,
        manualFileName: file.name,
        manualMimeType: file.type,
      },
    });

    if (previousUrl && process.env.BLOB_READ_WRITE_TOKEN) {
      try {
        await del(previousUrl, { token: process.env.BLOB_READ_WRITE_TOKEN });
      } catch {
        /* best-effort */
      }
    }

    return NextResponse.json({
      manualUrl: blobProxyUrl(updated.manualUrl) ?? updated.manualUrl,
      manualFileName: updated.manualFileName,
      manualMimeType: updated.manualMimeType,
    });
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return unauthorizedResponse();
    }
    console.error("Parts manual upload error:", error);
    return NextResponse.json({ error: "Upload failed" }, { status: 500 });
  }
}
