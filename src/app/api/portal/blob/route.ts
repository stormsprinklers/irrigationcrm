import { NextRequest, NextResponse } from "next/server";
import { get } from "@vercel/blob";
import { badRequestResponse, forbiddenResponse } from "@/lib/api-auth";
import { blobPathnameFromUrl, isBlobStorageUrl } from "@/lib/blob/urls";
import { getBlobToken } from "@/lib/blob/storage";
import { prisma } from "@/lib/prisma";
import { requirePortalCustomer, portalUnauthorizedResponse } from "@/lib/portal/auth";

export async function GET(request: NextRequest) {
  const ctx = await requirePortalCustomer();
  if (!ctx) return portalUnauthorizedResponse();

  const attachmentId = request.nextUrl.searchParams.get("attachmentId");
  const visitAttachmentId = request.nextUrl.searchParams.get("visitAttachmentId");
  if (!attachmentId && !visitAttachmentId) {
    return badRequestResponse("attachmentId or visitAttachmentId is required");
  }

  let blobUrl: string;
  let mimeType: string;
  let fileName: string;

  if (visitAttachmentId) {
    const attachment = await prisma.visitAttachment.findFirst({
      where: {
        id: visitAttachmentId,
        visit: {
          companyId: ctx.companyId,
          customerId: ctx.customerId,
        },
      },
      select: { blobUrl: true, mimeType: true, fileName: true },
    });
    if (!attachment) return forbiddenResponse();
    blobUrl = attachment.blobUrl;
    mimeType = attachment.mimeType;
    fileName = attachment.fileName;
  } else {
    const attachment = await prisma.customerAttachment.findFirst({
      where: {
        id: attachmentId!,
        customerId: ctx.customerId,
        customer: { companyId: ctx.companyId },
      },
      select: { blobUrl: true, mimeType: true, fileName: true },
    });
    if (!attachment) return forbiddenResponse();
    blobUrl = attachment.blobUrl;
    mimeType = attachment.mimeType;
    fileName = attachment.fileName;

    const pathname = isBlobStorageUrl(blobUrl) ? blobPathnameFromUrl(blobUrl) : null;
    const isCustomerUpload = pathname?.startsWith(
      `customers/${ctx.companyId}/${ctx.customerId}/`
    );
    const isWebsiteLeadUpload = pathname?.startsWith(`leads/${ctx.companyId}/`);
    if (!isCustomerUpload && !isWebsiteLeadUpload) {
      return forbiddenResponse();
    }
  }

  const pathname = isBlobStorageUrl(blobUrl) ? blobPathnameFromUrl(blobUrl) : null;
  if (!pathname) {
    // External / non-blob URL — redirect
    return NextResponse.redirect(blobUrl);
  }

  if (visitAttachmentId && !pathname.startsWith(`visits/${ctx.companyId}/`)) {
    return forbiddenResponse();
  }

  const token = getBlobToken();
  if (!token) {
    return NextResponse.json({ error: "Blob storage is not configured" }, { status: 503 });
  }

  const result = await get(pathname, { access: "private", token });
  if (!result || result.statusCode !== 200 || !result.stream) {
    return new NextResponse("Not found", { status: 404 });
  }

  return new NextResponse(result.stream, {
    headers: {
      "Content-Type": safeAttachmentContentType(result.blob.contentType ?? mimeType),
      "Content-Disposition": `${safeAttachmentDisposition(mimeType)}; filename="${fileName.replace(/"/g, "")}"`,
      "Content-Security-Policy": "default-src 'none'; img-src data:; style-src 'unsafe-inline'; sandbox",
      "Cache-Control": "private, max-age=3600",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

function safeAttachmentContentType(mimeType: string) {
  const normalized = mimeType.toLowerCase();
  if (normalized.startsWith("image/") && normalized !== "image/svg+xml") return normalized;
  if (normalized === "application/pdf" || normalized === "text/plain") return normalized;
  return "application/octet-stream";
}

function safeAttachmentDisposition(mimeType: string) {
  const normalized = mimeType.toLowerCase();
  return normalized.startsWith("image/") && normalized !== "image/svg+xml" ? "inline" : "attachment";
}
