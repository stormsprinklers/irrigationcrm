import { NextRequest, NextResponse } from "next/server";
import {
  badRequestResponse,
  forbiddenResponse,
  requireSessionUser,
  unauthorizedResponse,
} from "@/lib/api-auth";
import { canManageCustomers } from "@/lib/customers/permissions";
import { GoogleBusinessApiError, requireGbpCompany } from "@/lib/google-business/client";
import { createGbpLocalPost, listGbpLocalPosts } from "@/lib/google-business/v4-api";
import { resolveGbpLocalPostPhotoSourceUrl } from "@/lib/google-business/gbp-media-upload";

export async function GET() {
  try {
    const user = await requireSessionUser();
    const company = await requireGbpCompany(user.companyId);

    const posts = await listGbpLocalPosts(
      user.companyId,
      company.googleBusinessAccountId!,
      company.googleBusinessLocationId!
    );

    return NextResponse.json({ posts });
  } catch (error) {
    if (error instanceof GoogleBusinessApiError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    if (error instanceof Error && error.message === "Unauthorized") {
      return unauthorizedResponse();
    }
    const message = error instanceof Error ? error.message : "Failed to load posts";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await requireSessionUser();
    if (!canManageCustomers(user.role)) return forbiddenResponse();

    const company = await requireGbpCompany(user.companyId);
    const body = await request.json();
    const summary = String(body.summary ?? "").trim();
    if (!summary) return badRequestResponse("Post text is required");

    let photoSourceUrl: string | null = null;
    const photoId = body.photoId ?? body.attachmentId;
    if (photoId) {
      photoSourceUrl = await resolveGbpLocalPostPhotoSourceUrl({
        companyId: user.companyId,
        photoId: String(photoId),
        previewUrl: String(body.previewUrl ?? "").trim() || null,
      });
    }

    const post = await createGbpLocalPost(
      user.companyId,
      company.googleBusinessAccountId!,
      company.googleBusinessLocationId!,
      summary,
      photoSourceUrl
    );

    return NextResponse.json(post);
  } catch (error) {
    if (error instanceof GoogleBusinessApiError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    if (error instanceof Error && error.message === "Unauthorized") {
      return unauthorizedResponse();
    }
    const message = error instanceof Error ? error.message : "Failed to create post";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
