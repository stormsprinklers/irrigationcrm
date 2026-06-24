import { NextRequest, NextResponse } from "next/server";
import { SocialPostSubmissionStatus } from "@prisma/client";
import {
  badRequestResponse,
  forbiddenResponse,
  notFoundResponse,
  requireSessionUser,
  unauthorizedResponse,
} from "@/lib/api-auth";
import {
  canSubmitSocialPosts,
  canViewSocialMarketing,
} from "@/lib/marketing/social-permissions";
import {
  canEditSubmission,
  serializeSubmission,
  submissionInclude,
} from "@/lib/marketing/social-submissions";
import { prisma } from "@/lib/prisma";

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(_request: NextRequest, context: RouteContext) {
  try {
    const user = await requireSessionUser();
    if (!canViewSocialMarketing(user.role)) return forbiddenResponse();

    const { id } = await context.params;
    const submission = await prisma.socialPostSubmission.findFirst({
      where: { id, companyId: user.companyId },
      include: submissionInclude,
    });
    if (!submission) return notFoundResponse();

    return NextResponse.json({ submission: serializeSubmission(submission) });
  } catch {
    return unauthorizedResponse();
  }
}

export async function PATCH(request: NextRequest, context: RouteContext) {
  try {
    const user = await requireSessionUser();
    if (!canSubmitSocialPosts(user.role)) return forbiddenResponse();

    const { id } = await context.params;
    const existing = await prisma.socialPostSubmission.findFirst({
      where: { id, companyId: user.companyId },
    });
    if (!existing) return notFoundResponse();
    if (!canEditSubmission(existing, user.id, user.role)) return forbiddenResponse();

    const body = await request.json();
    const data: {
      caption?: string | null;
      postType?: string;
      platform?: string;
    } = {};

    if (body.caption !== undefined) {
      data.caption = typeof body.caption === "string" ? body.caption.trim() || null : null;
    }
    if (typeof body.postType === "string") data.postType = body.postType.trim() || "post";
    if (typeof body.platform === "string" && ["facebook", "instagram"].includes(body.platform)) {
      data.platform = body.platform;
    }

    if (Array.isArray(body.media)) {
      await prisma.socialPostSubmissionMedia.deleteMany({ where: { submissionId: id } });
      await prisma.socialPostSubmissionMedia.createMany({
        data: body.media.map(
          (
            item: { blobUrl: string; fileName?: string; mimeType?: string },
            index: number
          ) => ({
            submissionId: id,
            blobUrl: item.blobUrl,
            fileName: item.fileName ?? "media",
            mimeType: item.mimeType ?? "application/octet-stream",
            sortOrder: index,
          })
        ),
      });
    }

    const submission = await prisma.socialPostSubmission.update({
      where: { id },
      data: {
        ...data,
        ...(existing.status === SocialPostSubmissionStatus.REVISION_REQUESTED
          ? { status: SocialPostSubmissionStatus.DRAFT }
          : {}),
      },
      include: submissionInclude,
    });

    return NextResponse.json({ submission: serializeSubmission(submission) });
  } catch {
    return unauthorizedResponse();
  }
}

export async function DELETE(_request: NextRequest, context: RouteContext) {
  try {
    const user = await requireSessionUser();
    if (!canSubmitSocialPosts(user.role)) return forbiddenResponse();

    const { id } = await context.params;
    const existing = await prisma.socialPostSubmission.findFirst({
      where: { id, companyId: user.companyId },
    });
    if (!existing) return notFoundResponse();
    if (!canEditSubmission(existing, user.id, user.role)) return forbiddenResponse();
    if (
      existing.status === SocialPostSubmissionStatus.PUBLISHED ||
      existing.status === SocialPostSubmissionStatus.SCHEDULED
    ) {
      return badRequestResponse("Cannot delete scheduled or published posts.");
    }

    await prisma.socialPostSubmission.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch {
    return unauthorizedResponse();
  }
}
