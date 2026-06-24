import { NextRequest, NextResponse } from "next/server";
import { SocialPostSubmissionStatus } from "@prisma/client";
import { forbiddenResponse, requireSessionUser, unauthorizedResponse } from "@/lib/api-auth";
import {
  canSubmitSocialPosts,
  canViewSocialMarketing,
} from "@/lib/marketing/social-permissions";
import {
  serializeSubmission,
  submissionInclude,
} from "@/lib/marketing/social-submissions";
import { prisma } from "@/lib/prisma";

export async function GET(request: NextRequest) {
  try {
    const user = await requireSessionUser();
    if (!canViewSocialMarketing(user.role)) return forbiddenResponse();

    const status = request.nextUrl.searchParams.get("status");
    const platform = request.nextUrl.searchParams.get("platform");
    const mine = request.nextUrl.searchParams.get("mine") === "1";

    const submissions = await prisma.socialPostSubmission.findMany({
      where: {
        companyId: user.companyId,
        ...(status ? { status: status as SocialPostSubmissionStatus } : {}),
        ...(platform ? { platform } : {}),
        ...(mine ? { createdById: user.id } : {}),
      },
      include: submissionInclude,
      orderBy: { updatedAt: "desc" },
      take: 100,
    });

    return NextResponse.json({
      submissions: submissions.map(serializeSubmission),
    });
  } catch {
    return unauthorizedResponse();
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await requireSessionUser();
    if (!canSubmitSocialPosts(user.role)) return forbiddenResponse();

    const body = await request.json();
    const platform = typeof body.platform === "string" ? body.platform.trim() : "";
    const postType = typeof body.postType === "string" ? body.postType.trim() : "post";
    const caption = typeof body.caption === "string" ? body.caption.trim() : "";

    if (!["facebook", "instagram"].includes(platform)) {
      return NextResponse.json({ error: "platform must be facebook or instagram" }, { status: 400 });
    }

    const media = Array.isArray(body.media) ? body.media : [];

    const submission = await prisma.socialPostSubmission.create({
      data: {
        companyId: user.companyId,
        platform,
        postType: postType || "post",
        caption: caption || null,
        status: SocialPostSubmissionStatus.DRAFT,
        createdById: user.id,
        media: {
          create: media
            .filter(
              (item: unknown): item is { blobUrl: string; fileName: string; mimeType: string } =>
                Boolean(
                  item &&
                    typeof item === "object" &&
                    "blobUrl" in item &&
                    typeof (item as { blobUrl: unknown }).blobUrl === "string"
                )
            )
            .map(
              (
                item: { blobUrl: string; fileName?: string; mimeType?: string },
                index: number
              ) => ({
                blobUrl: item.blobUrl,
                fileName: item.fileName ?? "media",
                mimeType: item.mimeType ?? "application/octet-stream",
                sortOrder: index,
              })
            ),
        },
      },
      include: submissionInclude,
    });

    return NextResponse.json({ submission: serializeSubmission(submission) });
  } catch {
    return unauthorizedResponse();
  }
}
