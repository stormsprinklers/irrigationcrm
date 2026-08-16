import { NextRequest, NextResponse } from "next/server";
import { get } from "@vercel/blob";
import { blobPathnameFromUrl, isBlobStorageUrl } from "@/lib/blob/urls";
import { getBlobToken } from "@/lib/blob/storage";
import { prisma } from "@/lib/prisma";

type Params = { params: Promise<{ token: string; attachmentId: string }> };

/** Unauthenticated job media for paid-receipt emails, scoped to the invoice public token. */
export async function GET(_request: NextRequest, { params }: Params) {
  try {
    const { token, attachmentId } = await params;
    const invoice = await prisma.invoice.findFirst({
      where: { publicToken: token },
      select: { visitId: true, companyId: true },
    });
    if (!invoice?.visitId) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const attachment = await prisma.visitAttachment.findFirst({
      where: {
        id: attachmentId,
        visitId: invoice.visitId,
        visit: { companyId: invoice.companyId },
      },
      select: { blobUrl: true, mimeType: true, fileName: true },
    });
    if (!attachment) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    if (!isBlobStorageUrl(attachment.blobUrl)) {
      return NextResponse.redirect(attachment.blobUrl);
    }

    const pathname = blobPathnameFromUrl(attachment.blobUrl);
    if (!pathname?.startsWith(`visits/${invoice.companyId}/`)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const blobToken = getBlobToken();
    if (!blobToken) {
      return NextResponse.json({ error: "Blob storage is not configured" }, { status: 503 });
    }

    const result = await get(pathname, { access: "private", token: blobToken });
    if (!result || result.statusCode !== 200 || !result.stream) {
      return new NextResponse("Not found", { status: 404 });
    }

    return new NextResponse(result.stream, {
      headers: {
        "Content-Type": result.blob.contentType ?? attachment.mimeType,
        "Content-Disposition": `inline; filename="${attachment.fileName.replace(/"/g, "")}"`,
        "Cache-Control": "public, max-age=86400",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    console.error("Receipt attachment proxy error:", error);
    return NextResponse.json({ error: "Failed to load file" }, { status: 500 });
  }
}
