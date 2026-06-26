import { NextRequest, NextResponse } from "next/server";
import { get } from "@vercel/blob";
import { blobPathnameFromUrl, isBlobStorageUrl } from "@/lib/blob/urls";
import { getBlobToken } from "@/lib/blob/storage";
import { prisma } from "@/lib/prisma";

/** Twilio-accessible technician photo proxy (no session auth; user id is unguessable). */
export async function GET(request: NextRequest) {
  const userId = request.nextUrl.searchParams.get("id");
  if (!userId) {
    return new NextResponse("Missing user id", { status: 400 });
  }

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { photoUrl: true },
  });
  if (!user?.photoUrl) {
    return new NextResponse("Not found", { status: 404 });
  }

  if (!isBlobStorageUrl(user.photoUrl)) {
    return NextResponse.redirect(user.photoUrl);
  }

  const pathname = blobPathnameFromUrl(user.photoUrl);
  if (!pathname) {
    return new NextResponse("Invalid photo storage", { status: 404 });
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
      "Content-Type": result.blob.contentType || "image/jpeg",
      "Cache-Control": "public, max-age=86400",
    },
  });
}
