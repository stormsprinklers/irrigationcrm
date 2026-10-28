import { NextRequest, NextResponse } from "next/server";
import { handleUpload, type HandleUploadBody } from "@vercel/blob/client";
import { requireSessionUser, unauthorizedResponse } from "@/lib/api-auth";
import { getBlobToken } from "@/lib/blob/storage";
import { prisma } from "@/lib/prisma";

const ALLOWED_VIDEO_TYPES = ["video/mp4", "video/webm", "video/quicktime"];
const MAX_VIDEO_BYTES = 500 * 1024 * 1024;

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as HandleUploadBody;
    const result = await handleUpload({
      request,
      body,
      token: getBlobToken(),
      onBeforeGenerateToken: async (pathname) => {
        const user = await requireSessionUser();
        if (user.role !== "ADMIN" && user.role !== "MANAGER") {
          throw new Error("Forbidden");
        }
        const expectedPrefix = `estimate-vsl/${user.companyId}/`;
        if (!pathname.startsWith(expectedPrefix)) {
          throw new Error("Invalid video upload path");
        }
        return {
          allowedContentTypes: ALLOWED_VIDEO_TYPES,
          maximumSizeInBytes: MAX_VIDEO_BYTES,
          addRandomSuffix: false,
          tokenPayload: JSON.stringify({ companyId: user.companyId }),
        };
      },
      onUploadCompleted: async ({ blob, tokenPayload }) => {
        const parsed = JSON.parse(tokenPayload ?? "{}") as { companyId?: unknown };
        if (typeof parsed.companyId !== "string") {
          throw new Error("Missing company upload context");
        }
        if (!blob.pathname.startsWith(`estimate-vsl/${parsed.companyId}/`)) {
          throw new Error("Invalid completed video path");
        }
        await prisma.company.update({
          where: { id: parsed.companyId },
          data: { estimateVslVideoUrl: blob.url },
        });
      },
    });
    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return unauthorizedResponse();
    }
    const message = error instanceof Error ? error.message : "Video upload failed";
    return NextResponse.json({ error: message }, { status: message === "Forbidden" ? 403 : 400 });
  }
}
