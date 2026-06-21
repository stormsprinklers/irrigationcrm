import { NextRequest, NextResponse } from "next/server";
import { get } from "@vercel/blob";
import { prisma } from "@/lib/prisma";
import { blobPathnameFromUrl, isBlobStorageUrl } from "@/lib/blob/urls";
import { getBlobToken } from "@/lib/blob/storage";

/** Twilio-accessible audio clip proxy (no session auth; clip id is unguessable). */
export async function GET(request: NextRequest) {
  const clipId = request.nextUrl.searchParams.get("id");
  if (!clipId) {
    return new NextResponse("Missing clip id", { status: 400 });
  }

  const clip = await prisma.voiceClip.findUnique({ where: { id: clipId } });
  if (!clip) {
    return new NextResponse("Not found", { status: 404 });
  }

  const pathname = isBlobStorageUrl(clip.blobUrl)
    ? blobPathnameFromUrl(clip.blobUrl)
    : clip.blobUrl.replace(/^\/+/, "");

  if (!pathname) {
    return new NextResponse("Invalid clip storage", { status: 404 });
  }

  const token = getBlobToken();
  if (!token) {
    return NextResponse.json({ error: "Blob storage not configured" }, { status: 503 });
  }

  const result = await get(pathname, { access: "private", token });
  if (!result || result.statusCode !== 200 || !result.stream) {
    return new NextResponse("Not found", { status: 404 });
  }

  return new NextResponse(result.stream, {
    headers: {
      "Content-Type": clip.mimeType || result.blob.contentType,
      "Cache-Control": "public, max-age=86400",
    },
  });
}
