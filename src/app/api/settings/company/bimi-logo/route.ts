import { NextRequest, NextResponse } from "next/server";
import { badRequestResponse, forbiddenResponse, requireSessionUser, unauthorizedResponse } from "@/lib/api-auth";
import { absolutePublicBlobUrl, blobProxyUrl } from "@/lib/blob/urls";
import { uploadPrivateBlob } from "@/lib/blob/storage";
import { companySettingsSelect } from "@/lib/company/types";
import { prisma } from "@/lib/prisma";

const MAX_SIZE = 64 * 1024;
const ALLOWED_TYPES = ["image/svg+xml", "text/plain", "application/xml", "text/xml"];

function looksLikeSvg(file: File, text: string) {
  if (file.type === "image/svg+xml") return true;
  const name = file.name.toLowerCase();
  if (name.endsWith(".svg")) return true;
  return /^\s*<\?xml|^\s*<svg[\s>]/i.test(text);
}

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

    if (file.size > MAX_SIZE) {
      return badRequestResponse("BIMI SVG must be under 64KB (BIMI Group recommends ≤32KB).");
    }

    const text = await file.text();
    if (!looksLikeSvg(file, text) && !ALLOWED_TYPES.includes(file.type)) {
      return badRequestResponse("Invalid file type. Upload a BIMI-compatible SVG (.svg).");
    }
    if (!/<svg[\s>]/i.test(text)) {
      return badRequestResponse("File does not look like a valid SVG.");
    }

    const blob = await uploadPrivateBlob(
      `company-bimi/${user.companyId}/${Date.now()}-bimi-logo.svg`,
      text,
      { contentType: "image/svg+xml" }
    );

    const company = await prisma.company.update({
      where: { id: user.companyId },
      data: { bimiLogoUrl: blob.url },
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
    console.error("Company BIMI logo upload failed:", error);
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
      data: { bimiLogoUrl: null },
      select: companySettingsSelect,
    });

    return NextResponse.json({ company });
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return unauthorizedResponse();
    }
    return NextResponse.json({ error: "Failed to remove BIMI logo" }, { status: 500 });
  }
}
