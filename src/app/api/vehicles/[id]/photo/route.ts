import { NextRequest, NextResponse } from "next/server";
import {
  badRequestResponse,
  forbiddenResponse,
  requireSessionUser,
  unauthorizedResponse,
} from "@/lib/api-auth";
import { uploadPrivateBlob } from "@/lib/blob/storage";
import { prisma } from "@/lib/prisma";
import { canManageVehicles } from "@/lib/vehicles/permissions";

type Params = { params: Promise<{ id: string }> };

const MAX_SIZE = 10 * 1024 * 1024;
const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif"];

export async function POST(request: NextRequest, { params }: Params) {
  try {
    const user = await requireSessionUser();
    if (!canManageVehicles(user.role)) return forbiddenResponse();
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

    const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
    const blob = await uploadPrivateBlob(
      `vehicles/${vehicle.companyId}/${id}/photo-${Date.now()}-${safeName}`,
      file,
      { contentType: file.type }
    );

    const updated = await prisma.vehicle.update({
      where: { id },
      data: { photoUrl: blob.url },
      select: { id: true, photoUrl: true },
    });

    return NextResponse.json(updated);
  } catch {
    return unauthorizedResponse();
  }
}
