import { NextRequest, NextResponse } from "next/server";
import { badRequestResponse, forbiddenResponse, requireSessionUser, unauthorizedResponse } from "@/lib/api-auth";
import { absolutePublicBlobUrl, blobProxyUrl } from "@/lib/blob/urls";
import { uploadPrivateBlob } from "@/lib/blob/storage";
import { companySettingsSelect } from "@/lib/company/types";
import { prisma } from "@/lib/prisma";

const MAX_SIZE = 2 * 1024 * 1024;
const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp"];

export async function POST(request: NextRequest) {
  try {
    const user = await requireSessionUser();
    if (user.role !== "ADMIN" && user.role !== "MANAGER") {
      return forbiddenResponse();
    }

    const formData = await request.formData();
    const file = formData.get("file");

    if (!file || !(file instanceof File)) {
      return badRequestResponse("File is required");
    }

    if (!ALLOWED_TYPES.includes(file.type)) {
      return badRequestResponse("Invalid file type. Use JPEG, PNG, or WebP.");
    }

    if (file.size > MAX_SIZE) {
      return badRequestResponse("File must be under 2MB");
    }

    const ext = file.type === "image/png" ? "png" : file.type === "image/webp" ? "webp" : "jpg";
    const blob = await uploadPrivateBlob(
      `company-email/${user.companyId}/${Date.now()}-logo.${ext}`,
      file,
      { contentType: file.type }
    );

    const company = await prisma.company.update({
      where: { id: user.companyId },
      data: { emailLogoUrl: blob.url },
      select: companySettingsSelect,
    });

    return NextResponse.json({
      url: blob.url,
      displayUrl: blobProxyUrl(blob.url),
      publicUrl: absolutePublicBlobUrl(blob.url),
      company,
    });
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return unauthorizedResponse();
    }
    console.error("Company email logo upload failed:", error);
    const message = error instanceof Error ? error.message : "Upload failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function DELETE() {
  try {
    const user = await requireSessionUser();
    if (user.role !== "ADMIN" && user.role !== "MANAGER") {
      return forbiddenResponse();
    }

    const company = await prisma.company.update({
      where: { id: user.companyId },
      data: { emailLogoUrl: null },
      select: companySettingsSelect,
    });

    return NextResponse.json({ company });
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return unauthorizedResponse();
    }
    return NextResponse.json({ error: "Failed to remove logo" }, { status: 500 });
  }
}
