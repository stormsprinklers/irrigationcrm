import { NextRequest, NextResponse } from "next/server";
import { put } from "@vercel/blob";
import { EstimateStatus } from "@prisma/client";
import { badRequestResponse, requireSessionUser, unauthorizedResponse } from "@/lib/api-auth";
import { getEstimateForCompany } from "@/lib/estimates/queries";
import { prisma } from "@/lib/prisma";

type Params = { params: Promise<{ id: string }> };

export async function POST(request: NextRequest, { params }: Params) {
  try {
    const user = await requireSessionUser();
    const { id } = await params;
    const estimate = await prisma.estimate.findFirst({ where: { id, companyId: user.companyId } });
    if (!estimate) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const body = await request.json();
    const signature = body.signature as string | undefined;
    if (!signature?.startsWith("data:image/")) {
      return badRequestResponse("signature must be a base64 data URL");
    }

    if (!process.env.BLOB_READ_WRITE_TOKEN) {
      return NextResponse.json({ error: "BLOB_READ_WRITE_TOKEN is not configured" }, { status: 503 });
    }

    const [header, base64Data] = signature.split(",");
    const mimeMatch = header.match(/data:(image\/\w+);base64/);
    const mimeType = mimeMatch?.[1] ?? "image/png";
    const buffer = Buffer.from(base64Data, "base64");

    const blob = await put(`estimates/${estimate.companyId}/${id}/signature-${Date.now()}.png`, buffer, {
      access: "public",
      token: process.env.BLOB_READ_WRITE_TOKEN,
      contentType: mimeType,
    });

    await prisma.estimate.update({
      where: { id },
      data: {
        signatureBlobUrl: blob.url,
        signedAt: new Date(),
        status: EstimateStatus.APPROVED,
        approvedAt: new Date(),
      },
    });

    const updated = await getEstimateForCompany(user.companyId, id);
    return NextResponse.json(updated);
  } catch {
    return unauthorizedResponse();
  }
}
