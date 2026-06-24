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
  if (!attachmentId) return badRequestResponse("attachmentId is required");

  const attachment = await prisma.customerAttachment.findFirst({
    where: {
      id: attachmentId,
      customerId: ctx.customerId,
      customer: { companyId: ctx.companyId },
    },
    select: { blobUrl: true, mimeType: true, fileName: true },
  });
  if (!attachment) return forbiddenResponse();

  const pathname = isBlobStorageUrl(attachment.blobUrl)
    ? blobPathnameFromUrl(attachment.blobUrl)
    : null;

  if (!pathname?.startsWith(`customers/${ctx.companyId}/${ctx.customerId}/`)) {
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
      "Content-Type": result.blob.contentType ?? attachment.mimeType,
      "Content-Disposition": `inline; filename="${attachment.fileName.replace(/"/g, "")}"`,
      "Cache-Control": "private, max-age=3600",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
