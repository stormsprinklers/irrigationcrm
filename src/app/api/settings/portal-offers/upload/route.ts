import { NextRequest, NextResponse } from "next/server";
import {
  badRequestResponse,
  forbiddenResponse,
  requireSessionUser,
  unauthorizedResponse,
} from "@/lib/api-auth";
import { absolutePublicBlobUrl, blobProxyUrl } from "@/lib/blob/urls";
import { uploadPrivateBlob } from "@/lib/blob/storage";

export async function POST(request: NextRequest) {
  try {
    const user = await requireSessionUser();
    if (user.role !== "ADMIN" && user.role !== "MANAGER") return forbiddenResponse();

    const formData = await request.formData();
    const file = formData.get("file");
    if (!(file instanceof File)) return badRequestResponse("file is required");

    if (!file.type.startsWith("image/")) {
      return badRequestResponse("Only image files are allowed");
    }

    const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
    const pathname = `portal-offers/${user.companyId}/${Date.now()}-${safeName}`;
    const blob = await uploadPrivateBlob(pathname, file, {
      contentType: file.type || "image/jpeg",
    });

    return NextResponse.json({
      url: blob.url,
      displayUrl: absolutePublicBlobUrl(blob.url) ?? blobProxyUrl(blob.url),
    });
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return unauthorizedResponse();
    }
    const message = error instanceof Error ? error.message : "Upload failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
