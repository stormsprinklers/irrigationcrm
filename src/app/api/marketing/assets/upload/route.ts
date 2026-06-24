import { NextRequest, NextResponse } from "next/server";
import { badRequestResponse, forbiddenResponse, requireSessionUser, unauthorizedResponse } from "@/lib/api-auth";
import { blobProxyUrl } from "@/lib/blob/urls";
import { uploadPrivateBlob } from "@/lib/blob/storage";
import { canSubmitSocialPosts } from "@/lib/marketing/social-permissions";

export async function POST(request: NextRequest) {
  try {
    const user = await requireSessionUser();
    if (!canSubmitSocialPosts(user.role)) return forbiddenResponse();
    const formData = await request.formData();
    const file = formData.get("file");

    if (!(file instanceof File)) {
      return badRequestResponse("file is required");
    }

    const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
    const pathname = `marketing/${user.companyId}/${Date.now()}-${safeName}`;
    const blob = await uploadPrivateBlob(pathname, file, {
      contentType: file.type || "application/octet-stream",
    });

    return NextResponse.json({
      url: blob.url,
      displayUrl: blobProxyUrl(blob.url),
      fileName: file.name,
      mimeType: file.type || "application/octet-stream",
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Upload failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
