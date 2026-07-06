import { NextRequest, NextResponse } from "next/server";
import {
  badRequestResponse,
  forbiddenResponse,
  requireSessionUser,
  unauthorizedResponse,
} from "@/lib/api-auth";
import { canManageCustomers } from "@/lib/customers/permissions";
import { GoogleBusinessApiError, requireGbpCompany } from "@/lib/google-business/client";
import { listGbpMedia } from "@/lib/google-business/v4-api";
import { uploadGbpPhotoFromPickableId } from "@/lib/google-business/gbp-media-upload";

export async function GET() {
  try {
    const user = await requireSessionUser();
    const company = await requireGbpCompany(user.companyId);

    const media = await listGbpMedia(
      user.companyId,
      company.googleBusinessAccountId!,
      company.googleBusinessLocationId!
    );

    return NextResponse.json({ media });
  } catch (error) {
    if (error instanceof GoogleBusinessApiError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    if (error instanceof Error && error.message === "Unauthorized") {
      return unauthorizedResponse();
    }
    const message = error instanceof Error ? error.message : "Failed to load media";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await requireSessionUser();
    if (!canManageCustomers(user.role)) return forbiddenResponse();

    const company = await requireGbpCompany(user.companyId);
    const body = await request.json();
    const photoId = String(body.photoId ?? body.attachmentId ?? "").trim();
    if (!photoId) return badRequestResponse("photoId is required");
    const previewUrl = String(body.previewUrl ?? "").trim() || null;

    const category =
      body.category === "ADDITIONAL" ||
      body.category === "EXTERIOR" ||
      body.category === "INTERIOR" ||
      body.category === "PRODUCT" ||
      body.category === "TEAMS"
        ? body.category
        : "AT_WORK";

    const media = await uploadGbpPhotoFromPickableId({
      companyId: user.companyId,
      accountId: company.googleBusinessAccountId!,
      locationId: company.googleBusinessLocationId!,
      photoId,
      previewUrl,
      category,
    });

    return NextResponse.json(media);
  } catch (error) {
    if (error instanceof GoogleBusinessApiError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    if (error instanceof Error && error.message === "Unauthorized") {
      return unauthorizedResponse();
    }
    const message = error instanceof Error ? error.message : "Failed to upload photo";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
