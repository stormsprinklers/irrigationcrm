import { NextRequest, NextResponse } from "next/server";
import { get } from "@vercel/blob";
import { canPublicAccessBlobPath } from "@/lib/blob/urls";
import { getBlobToken } from "@/lib/blob/storage";

/** Unauthenticated fetch for allowlisted branding / marketing media on a private blob store. */
export async function GET(request: NextRequest) {
  try {
    const pathname = request.nextUrl.searchParams.get("pathname");
    if (!pathname) {
      return NextResponse.json({ error: "pathname is required" }, { status: 400 });
    }
    if (!canPublicAccessBlobPath(pathname)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

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
        "Cache-Control": "public, max-age=86400",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    console.error("Public blob proxy error:", error);
    return NextResponse.json({ error: "Failed to load file" }, { status: 500 });
  }
}
