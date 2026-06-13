import { NextRequest, NextResponse } from "next/server";
import { get } from "@vercel/blob";
import {
  badRequestResponse,
  forbiddenResponse,
  requireSessionUser,
  unauthorizedResponse,
} from "@/lib/api-auth";
import { canAccessBlobPath } from "@/lib/blob/urls";
import { getBlobToken } from "@/lib/blob/storage";

export async function GET(request: NextRequest) {
  try {
    const user = await requireSessionUser();
    const pathname = request.nextUrl.searchParams.get("pathname");

    if (!pathname) return badRequestResponse("pathname is required");
    if (!canAccessBlobPath(user.companyId, pathname)) return forbiddenResponse();

    const token = getBlobToken();
    if (!token) {
      return NextResponse.json({ error: "Blob storage is not configured" }, { status: 503 });
    }

    const result = await get(pathname, {
      access: "private",
      token,
    });

    if (!result || result.statusCode !== 200 || !result.stream) {
      return new NextResponse("Not found", { status: 404 });
    }

    return new NextResponse(result.stream, {
      headers: {
        "Content-Type": result.blob.contentType,
        "Cache-Control": "private, max-age=3600",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return unauthorizedResponse();
    }
    console.error("Blob proxy error:", error);
    return NextResponse.json({ error: "Failed to load file" }, { status: 500 });
  }
}
