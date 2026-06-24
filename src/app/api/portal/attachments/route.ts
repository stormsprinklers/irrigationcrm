import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requirePortalCustomer, portalUnauthorizedResponse } from "@/lib/portal/auth";

export async function GET() {
  const ctx = await requirePortalCustomer();
  if (!ctx) return portalUnauthorizedResponse();

  const attachments = await prisma.customerAttachment.findMany({
    where: { customerId: ctx.customerId, customer: { companyId: ctx.companyId } },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      fileName: true,
      mimeType: true,
      createdAt: true,
      blobUrl: true,
    },
  });

  return NextResponse.json({
    attachments: attachments.map((a) => ({
      id: a.id,
      fileName: a.fileName,
      mimeType: a.mimeType,
      createdAt: a.createdAt.toISOString(),
      url: `/api/portal/blob?attachmentId=${encodeURIComponent(a.id)}`,
    })),
  });
}
