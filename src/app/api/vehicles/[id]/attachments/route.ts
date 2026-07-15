import { NextRequest, NextResponse } from "next/server";
import { VehicleAttachmentKind } from "@prisma/client";
import {
  badRequestResponse,
  forbiddenResponse,
  requireSessionUser,
  unauthorizedResponse,
} from "@/lib/api-auth";
import { uploadPrivateBlob } from "@/lib/blob/storage";
import { prisma } from "@/lib/prisma";
import { canContributeVehicles } from "@/lib/vehicles/permissions";

type Params = { params: Promise<{ id: string }> };

const MAX_SIZE = 10 * 1024 * 1024;
const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif", "application/pdf"];

export async function GET(request: NextRequest, { params }: Params) {
  try {
    const user = await requireSessionUser();
    if (!canContributeVehicles(user.role)) return forbiddenResponse();
    const { id } = await params;
    const kindParam = request.nextUrl.searchParams.get("kind");
    const kind =
      kindParam && Object.values(VehicleAttachmentKind).includes(kindParam as VehicleAttachmentKind)
        ? (kindParam as VehicleAttachmentKind)
        : undefined;

    const attachments = await prisma.vehicleAttachment.findMany({
      where: {
        vehicleId: id,
        vehicle: { companyId: user.companyId },
        ...(kind ? { kind } : {}),
      },
      orderBy: { createdAt: "desc" },
      include: { uploadedBy: { select: { id: true, name: true } } },
    });

    return NextResponse.json(attachments);
  } catch {
    return unauthorizedResponse();
  }
}

export async function POST(request: NextRequest, { params }: Params) {
  try {
    const user = await requireSessionUser();
    if (!canContributeVehicles(user.role)) return forbiddenResponse();
    const { id } = await params;

    const vehicle = await prisma.vehicle.findFirst({
      where: { id, companyId: user.companyId },
      select: { id: true, companyId: true },
    });
    if (!vehicle) return NextResponse.json({ error: "Not found" }, { status: 404 });

    if (!process.env.BLOB_READ_WRITE_TOKEN) {
      return NextResponse.json({ error: "BLOB_READ_WRITE_TOKEN is not configured" }, { status: 503 });
    }

    const formData = await request.formData();
    const file = formData.get("file");
    if (!file || !(file instanceof File)) return badRequestResponse("File is required");
    if (!ALLOWED_TYPES.includes(file.type)) return badRequestResponse("Invalid file type");
    if (file.size > MAX_SIZE) return badRequestResponse("File must be under 10MB");

    const kindRaw = String(formData.get("kind") ?? "OTHER");
    const kind = Object.values(VehicleAttachmentKind).includes(kindRaw as VehicleAttachmentKind)
      ? (kindRaw as VehicleAttachmentKind)
      : VehicleAttachmentKind.OTHER;

    const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
    const blob = await uploadPrivateBlob(
      `vehicles/${vehicle.companyId}/${id}/${Date.now()}-${safeName}`,
      file,
      { contentType: file.type }
    );

    const attachment = await prisma.vehicleAttachment.create({
      data: {
        vehicleId: id,
        uploadedById: user.id,
        blobUrl: blob.url,
        fileName: file.name,
        mimeType: file.type,
        kind,
      },
      include: { uploadedBy: { select: { id: true, name: true } } },
    });

    return NextResponse.json(attachment, { status: 201 });
  } catch {
    return unauthorizedResponse();
  }
}

export async function DELETE(request: NextRequest, { params }: Params) {
  try {
    const user = await requireSessionUser();
    if (!canContributeVehicles(user.role)) return forbiddenResponse();
    const { id } = await params;
    const attachmentId = request.nextUrl.searchParams.get("attachmentId");
    if (!attachmentId) return badRequestResponse("attachmentId required");

    await prisma.vehicleAttachment.deleteMany({
      where: {
        id: attachmentId,
        vehicleId: id,
        vehicle: { companyId: user.companyId },
      },
    });

    return NextResponse.json({ ok: true });
  } catch {
    return unauthorizedResponse();
  }
}
