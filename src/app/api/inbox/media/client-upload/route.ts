import { randomUUID } from "node:crypto";
import { handleUpload, type HandleUploadBody } from "@vercel/blob/client";
import { NextRequest, NextResponse } from "next/server";
import { requireSessionUser, unauthorizedResponse } from "@/lib/api-auth";
import {
  SMS_ALLOWED_MIME_TYPES,
  SMS_LINK_MEDIA_MAX_BYTES,
  isAllowedSmsMimeType,
  safeFileName,
} from "@/lib/inbox/attachments";

export async function GET(request: NextRequest) {
  try {
    const user = await requireSessionUser(request);
    const fileName = safeFileName(request.nextUrl.searchParams.get("fileName") ?? "media");
    const contentType = request.nextUrl.searchParams.get("contentType") ?? "";
    if (!isAllowedSmsMimeType(contentType)) {
      return NextResponse.json({ error: "Unsupported media type for SMS/MMS" }, { status: 400 });
    }
    return NextResponse.json({
      pathname: `inbox/${user.companyId}/sms/outbound/${Date.now()}-${randomUUID()}-${fileName}`,
      maxBytes: SMS_LINK_MEDIA_MAX_BYTES,
    });
  } catch {
    return unauthorizedResponse();
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await requireSessionUser(request);
    const body = (await request.json()) as HandleUploadBody;
    const prefix = `inbox/${user.companyId}/sms/outbound/`;
    const response = await handleUpload({
      body,
      request,
      onBeforeGenerateToken: async (pathname) => {
        if (!pathname.startsWith(prefix)) {
          throw new Error("Invalid SMS media upload path");
        }
        return {
          allowedContentTypes: [...SMS_ALLOWED_MIME_TYPES],
          maximumSizeInBytes: SMS_LINK_MEDIA_MAX_BYTES,
          addRandomSuffix: false,
        };
      },
    });
    return NextResponse.json(response);
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return unauthorizedResponse();
    }
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Upload authorization failed" },
      { status: 400 }
    );
  }
}
