import { NextRequest, NextResponse } from "next/server";
import {
  badRequestResponse,
  requireSessionUser,
  unauthorizedResponse,
} from "@/lib/api-auth";
import { uploadPrivateBlob } from "@/lib/blob/storage";
import {
  EMAIL_ALLOWED_MIME_TYPES,
  EMAIL_ATTACHMENT_MAX_BYTES,
  SMS_ALLOWED_MIME_TYPES,
  SMS_MEDIA_MAX_BYTES,
  SMS_MEDIA_MAX_COUNT,
  isAllowedEmailMimeType,
  isAllowedSmsMimeType,
  safeFileName,
} from "@/lib/inbox/attachments";
import { pathnameFromBlobUrl, twilioAccessibleMediaUrl } from "@/lib/inbox/media-url";

export async function POST(request: NextRequest) {
  try {
    const user = await requireSessionUser();
    const channel = request.nextUrl.searchParams.get("channel") ?? "email";

    if (!process.env.BLOB_READ_WRITE_TOKEN) {
      return NextResponse.json(
        { error: "BLOB_READ_WRITE_TOKEN is not configured" },
        { status: 503 }
      );
    }

    const formData = await request.formData();
    const file = formData.get("file");
    if (!file || !(file instanceof File)) return badRequestResponse("File is required");

    if (channel === "sms") {
      if (!isAllowedSmsMimeType(file.type)) {
        return badRequestResponse("Unsupported media type for SMS/MMS");
      }
      if (file.size > SMS_MEDIA_MAX_BYTES) {
        return badRequestResponse("MMS files must be under 5MB");
      }

      const safeName = safeFileName(file.name);
      const pathname = `inbox/${user.companyId}/sms/outbound/${Date.now()}-${safeName}`;
      const blob = await uploadPrivateBlob(pathname, file, { contentType: file.type });

      return NextResponse.json({
        blobUrl: blob.url,
        publicUrl: twilioAccessibleMediaUrl(pathname),
        fileName: file.name,
        mimeType: file.type,
        sizeBytes: file.size,
      });
    }

    if (!isAllowedEmailMimeType(file.type)) {
      return badRequestResponse("Unsupported attachment type for email");
    }
    if (file.size > EMAIL_ATTACHMENT_MAX_BYTES) {
      return badRequestResponse("Email attachments must be under 10MB");
    }

    const safeName = safeFileName(file.name);
    const blob = await uploadPrivateBlob(
      `inbox/${user.companyId}/email/outbound/${Date.now()}-${safeName}`,
      file,
      { contentType: file.type }
    );

    return NextResponse.json({
      blobUrl: blob.url,
      fileName: file.name,
      mimeType: file.type,
      sizeBytes: file.size,
    });
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return unauthorizedResponse();
    }
    console.error("Inbox media upload failed", error);
    return NextResponse.json({ error: "Upload failed" }, { status: 500 });
  }
}

export async function GET() {
  return NextResponse.json({
    sms: {
      maxBytes: SMS_MEDIA_MAX_BYTES,
      maxCount: SMS_MEDIA_MAX_COUNT,
      allowedMimeTypes: SMS_ALLOWED_MIME_TYPES,
    },
    email: {
      maxBytes: EMAIL_ATTACHMENT_MAX_BYTES,
      allowedMimeTypes: EMAIL_ALLOWED_MIME_TYPES,
    },
  });
}
